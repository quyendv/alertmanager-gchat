const dotenv = require('dotenv');
const express = require('express');
const axios = require('axios');
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Environment variables
dotenv.config();
const PORT = 3000;
const GOOGLE_CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK_URL;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'alertmanager-gchat-transformer',
  });
});

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook payload:', JSON.stringify(req.body, null, 2));

    if (!GOOGLE_CHAT_WEBHOOK_URL) {
      throw new Error('GOOGLE_CHAT_WEBHOOK_URL environment variable is not set');
    }

    // Transform Alertmanager payload to Google Chat format
    // const chatMessage = transformAlertToGoogleChatText(req.body);
    const chatMessage = transformAlertToGoogleChatCard(req.body);
    // const chatMessage = transformAlertToSimpleCard(req.body);

    // console.log('raw message', JSON.stringify(chatMessage));

    // Send to Google Chat
    const response = await axios.post(GOOGLE_CHAT_WEBHOOK_URL, chatMessage, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    });

    console.log('Message sent to Google Chat successfully');
    res.status(200).json({
      status: 'success',
      message: 'Alert forwarded to Google Chat',
      chatResponse: response.status,
    });
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    console.error('Error details:', error.response?.data || error.stack);

    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Transform Alertmanager payload to Google Chat message format
function transformAlertToGoogleChatText(payload) {
  const status = payload.status || 'unknown';
  const receiver = payload.receiver || 'unknown';
  const alerts = payload.alerts || [];
  const groupKey = payload.groupKey || '';
  const externalURL = payload.externalURL || '';

  // Determine emoji based on status
  const statusEmoji = getStatusEmoji(status);

  // Create message sections
  let messageText = `${statusEmoji} *Prometheus Alert - ${status.toUpperCase()}*\n\n`;

  // Add basic info
  messageText += `* Receiver: ${receiver}\n`;
  messageText += `* Alerts Count: ${alerts.length}\n`;

  if (groupKey) {
    messageText += `* Group: ${groupKey}\n`;
  }

  messageText += '\n---\n\n';

  // Add alert details (limit to 5 alerts to avoid message being too long)
  const maxAlerts = Math.min(alerts.length, 5);

  for (let i = 0; i < maxAlerts; i++) {
    const alert = alerts[i];
    const alertName = alert.labels?.alertname || 'Unknown Alert';
    const instance = alert.labels?.instance || 'Unknown Instance';
    const severity = alert.labels?.severity || 'unknown';
    const summary = alert.annotations?.summary || '';
    const description = alert.annotations?.description || 'No description available';

    messageText += `*🔸 ${alertName}*\n`;
    messageText += `* Instance: ${instance}\n`;
    messageText += `* Severity: ${severity.toUpperCase()}\n`;

    if (summary) {
      messageText += `* Summary: ${summary}\n`;
    }

    if (description) {
      messageText += `* Description: ${description}\n`;
    }

    messageText += `* Alert Status: ${alert.status || 'unknown'}\n`;

    // Add timestamp if available
    if (alert.startsAt) {
      const startTime = new Date(alert.startsAt).toLocaleString();
      messageText += `* Started: ${startTime}\n`;
    }

    messageText += '\n';
  }

  // Add note if there are more alerts
  if (alerts.length > 5) {
    messageText += `_... and ${alerts.length - 5} more alerts_\n\n`;
  }

  // Add external URL
  if (externalURL) {
    messageText += `🔗 <${externalURL}|View in Alertmanager>\n`;
  }

  // Add timestamp
  messageText += `\n_Generated at: ${new Date().toLocaleString()}_`;

  return {
    text: messageText,
  };
}

// Get appropriate emoji based on alert status
function getStatusEmoji(status) {
  switch (status.toLowerCase()) {
    case 'firing':
      return '🚨';
    case 'resolved':
      return '✅';
    case 'pending':
      return '⏳';
    default:
      return '⚠️';
  }
}

function transformAlertToGoogleChatCard(payload) {
  const status = payload.status || 'unknown';
  const receiver = payload.receiver || 'unknown';
  const alerts = payload.alerts || [];
  const groupKey = payload.groupKey || '';
  const externalURL = payload.externalURL || '';

  // Determine colors and icons based on status
  const statusConfig = getStatusConfig(status);

  // Create widgets array
  const widgets = [];

  // Add header info using decoratedText
  widgets.push({
    decoratedText: {
      topLabel: 'Alert Status',
      text: status.toUpperCase(),
      startIcon: {
        iconUrl: statusConfig.iconUrl,
      },
    },
  });

  widgets.push({
    decoratedText: {
      topLabel: 'Receiver',
      text: receiver,
      startIcon: {
        knownIcon: 'PERSON',
      },
    },
  });

  widgets.push({
    decoratedText: {
      topLabel: 'Alert Count',
      text: alerts.length.toString(),
      startIcon: {
        knownIcon: 'DESCRIPTION',
      },
    },
  });

  if (groupKey) {
    widgets.push({
      decoratedText: {
        topLabel: 'Group Key',
        text: groupKey,
        startIcon: {
          knownIcon: 'BOOKMARK',
        },
      },
    });
  }

  // Add divider
  widgets.push({ divider: {} });

  // Add alert details (limit to 3 alerts for readability)
  const maxAlerts = Math.min(alerts.length, 3);

  for (let i = 0; i < maxAlerts; i++) {
    const alert = alerts[i];
    const alertName = alert.labels?.alertname || 'Unknown Alert';
    const instance = alert.labels?.instance || 'Unknown Instance';
    const severity = alert.labels?.severity || 'unknown';
    const summary = alert.annotations?.summary || '';
    const description = alert.annotations?.description || '';

    // Alert title
    widgets.push({
      textParagraph: {
        text: `<b>🔸 ${alertName}</b>`,
      },
    });

    // Instance info
    widgets.push({
      decoratedText: {
        topLabel: 'Instance',
        text: instance,
        startIcon: {
          // knownIcon: 'COMPUTER',
          iconUrl: 'https://developers.google.com/workspace/chat/images/quickstart-app-avatar.png',
        },
      },
    });

    // Severity info
    widgets.push({
      decoratedText: {
        topLabel: 'Severity',
        text: severity.toUpperCase(),
        startIcon: {
          iconUrl: getSeverityIconUrl(severity),
        },
      },
    });

    // Summary if available
    if (summary) {
      widgets.push({
        decoratedText: {
          topLabel: 'Summary',
          text: summary,
          wrapText: true,
          startIcon: {
            knownIcon: 'DESCRIPTION',
          },
        },
      });
    }

    // Description if available and different from summary
    if (description && description !== summary) {
      widgets.push({
        decoratedText: {
          topLabel: 'Description',
          text: description,
          wrapText: true,
          startIcon: {
            knownIcon: 'STAR',
          },
        },
      });
    }

    // Start time if available
    if (alert.startsAt) {
      const startTime = new Date(alert.startsAt).toLocaleString();
      widgets.push({
        decoratedText: {
          topLabel: 'Started At',
          text: startTime,
          startIcon: {
            knownIcon: 'CLOCK',
          },
        },
      });
    }

    // Add space between alerts
    if (i < maxAlerts - 1) {
      widgets.push({ divider: {} });
    }
  }

  // Add note if there are more alerts
  if (alerts.length > 3) {
    widgets.push({
      textParagraph: {
        text: `<i>... and ${alerts.length - 3} more alerts</i>`,
      },
    });
  }

  // Add action buttons if URL available
  if (externalURL) {
    widgets.push({ divider: {} });

    const buttons = [
      {
        text: 'View in Alertmanager',
        onClick: {
          openLink: {
            url: externalURL,
          },
        },
      },
    ];

    // Add silence button for firing alerts
    if (status.toLowerCase() === 'firing') {
      buttons.push({
        text: 'Create Silence',
        onClick: {
          openLink: {
            url: `${externalURL}/#/silences/new`,
          },
        },
      });
    }

    widgets.push({
      buttonList: {
        buttons: buttons,
      },
    });
  }

  // Add footer with timestamp
  widgets.push({ divider: {} });

  widgets.push({
    textParagraph: {
      text: `<i>Generated at: ${new Date().toLocaleString()}</i>`,
    },
  });

  return {
    cardsV2: [
      {
        cardId: `alert-${Date.now()}`,
        card: {
          header: {
            title: `Prometheus Alert - ${status.toUpperCase()}`,
            subtitle: `${alerts.length} alert(s) from ${receiver}`,
            imageUrl: statusConfig.iconUrl,
            imageType: 'CIRCLE',
          },
          sections: [
            {
              header: 'Alert Details',
              collapsible: true,
              uncollapsibleWidgetsCount: 1,
              widgets: widgets,
            },
          ],
        },
      },
    ],
  };
}

// Get status configuration with proper icon URLs
function getStatusConfig(status) {
  switch (status.toLowerCase()) {
    case 'firing':
      return {
        iconUrl: 'https://fonts.gstatic.com/s/i/googlematerialicons/error/v15/24px.svg',
      };
    case 'resolved':
      return {
        iconUrl: 'https://fonts.gstatic.com/s/i/googlematerialicons/check_circle/v15/24px.svg',
      };
    case 'pending':
      return {
        iconUrl: 'https://fonts.gstatic.com/s/i/googlematerialicons/schedule/v15/24px.svg',
      };
    default:
      return {
        iconUrl: 'https://fonts.gstatic.com/s/i/googlematerialicons/warning/v15/24px.svg',
      };
  }
}

// Get severity icon URL
function getSeverityIconUrl(severity) {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'https://fonts.gstatic.com/s/i/googlematerialicons/error/v15/24px.svg';
    case 'warning':
      return 'https://fonts.gstatic.com/s/i/googlematerialicons/warning/v15/24px.svg';
    case 'info':
      return 'https://fonts.gstatic.com/s/i/googlematerialicons/info/v15/24px.svg';
    default:
      return 'https://fonts.gstatic.com/s/i/googlematerialicons/help/v15/24px.svg';
  }
}

// Alternative even simpler version using mostly textParagraph
function transformAlertToSimpleCard(payload) {
  const status = payload.status || 'unknown';
  const receiver = payload.receiver || 'unknown';
  const alerts = payload.alerts || [];
  const externalURL = payload.externalURL || '';

  const statusConfig = getStatusConfig(status);
  const statusEmoji = getStatusEmoji(status);

  const widgets = [];

  // Basic info in a single text block
  widgets.push({
    textParagraph: {
      text: `${statusEmoji} <b>Status:</b> ${status.toUpperCase()}<br/>
             📧 <b>Receiver:</b> ${receiver}<br/>
             📊 <b>Alert Count:</b> ${alerts.length}`,
    },
  });

  widgets.push({
    divider: {},
  });

  // Add alert details
  const maxAlerts = Math.min(alerts.length, 3);
  for (let i = 0; i < maxAlerts; i++) {
    const alert = alerts[i];
    const alertName = alert.labels?.alertname || 'Unknown Alert';
    const instance = alert.labels?.instance || 'Unknown Instance';
    const severity = alert.labels?.severity || 'unknown';
    const summary = alert.annotations?.summary || '';

    let alertText = `🔸 <b>${alertName}</b><br/>`;
    alertText += `💻 <b>Instance:</b> ${instance}<br/>`;
    alertText += `⚡ <b>Severity:</b> ${severity.toUpperCase()}`;

    if (summary) {
      alertText += `<br/>📋 <b>Summary:</b> ${summary}`;
    }

    if (alert.startsAt) {
      const startTime = new Date(alert.startsAt).toLocaleString();
      alertText += `<br/>🕐 <b>Started:</b> ${startTime}`;
    }

    widgets.push({
      textParagraph: {
        text: alertText,
      },
    });

    if (i < maxAlerts - 1) {
      widgets.push({ divider: {} });
    }
  }

  if (alerts.length > 3) {
    widgets.push({
      textParagraph: {
        text: `<i>... and ${alerts.length - 3} more alerts</i>`,
      },
    });
  }

  // Add buttons if URL available
  if (externalURL) {
    widgets.push({
      divider: {},
    });

    widgets.push({
      buttonList: {
        buttons: [
          {
            text: 'View in Alertmanager',
            onClick: {
              openLink: {
                url: externalURL,
              },
            },
          },
        ],
      },
    });
  }

  // Footer
  widgets.push({
    divider: {},
  });

  widgets.push({
    textParagraph: {
      text: `<i>Generated at: ${new Date().toLocaleString()}</i>`,
    },
  });

  return {
    cardsV2: [
      {
        cardId: `alert-simple-${Date.now()}`,
        card: {
          header: {
            title: 'Prometheus Alert',
            subtitle: `${status.toUpperCase()} - ${alerts.length} alert(s)`,
            imageUrl: statusConfig.iconUrl,
            imageType: 'CIRCLE',
          },
          sections: [
            {
              widgets: widgets,
            },
          ],
        },
      },
    ],
  };
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
// app.use('*', (req, res) => { # < express v5
app.use('/{*any}', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    availableEndpoints: ['/webhook', '/health'],
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Alertmanager Google Chat Transformer running on port ${PORT}`);
  console.log(`📋 Health check available at: http://localhost:${PORT}/health`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);

  if (!GOOGLE_CHAT_WEBHOOK_URL) {
    console.warn('⚠️  WARNING: GOOGLE_CHAT_WEBHOOK_URL environment variable is not set!');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});
