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
    // Parse and format groupKey nicely
    const formattedGroupKey = formatGroupKey(groupKey);
    widgets.push({
      decoratedText: {
        topLabel: 'Group Key',
        text: formattedGroupKey,
        wrapText: true,
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
          iconUrl:
            'https://raw.githubusercontent.com/google/material-design-icons/master/png/action/dns/materialicons/24dp/2x/baseline_dns_black_24dp.png',
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

// Get status configuration with reliable icon URLs
function getStatusConfig(status) {
  switch (status.toLowerCase()) {
    case 'firing':
      return {
        iconUrl:
          'https://raw.githubusercontent.com/google/material-design-icons/master/png/alert/error/materialicons/24dp/2x/baseline_error_black_24dp.png',
      };
    case 'resolved':
      return {
        iconUrl:
          'https://raw.githubusercontent.com/google/material-design-icons/master/png/action/check_circle/materialicons/24dp/2x/baseline_check_circle_black_24dp.png',
      };
    case 'pending':
      return {
        iconUrl:
          'https://raw.githubusercontent.com/google/material-design-icons/master/png/action/schedule/materialicons/24dp/2x/baseline_schedule_black_24dp.png',
      };
    default:
      return {
        iconUrl:
          'https://raw.githubusercontent.com/google/material-design-icons/master/png/alert/warning/materialicons/24dp/2x/baseline_warning_black_24dp.png',
      };
  }
}

// Get severity icon URL - Using reliable GitHub-hosted Material Icons
function getSeverityIconUrl(severity) {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'https://raw.githubusercontent.com/google/material-design-icons/master/png/alert/error/materialicons/24dp/2x/baseline_error_black_24dp.png';
    case 'warning':
      return 'https://raw.githubusercontent.com/google/material-design-icons/master/png/alert/warning/materialicons/24dp/2x/baseline_warning_black_24dp.png';
    case 'info':
      return 'https://raw.githubusercontent.com/google/material-design-icons/master/png/action/info/materialicons/24dp/2x/baseline_info_black_24dp.png';
    default:
      return 'https://raw.githubusercontent.com/google/material-design-icons/master/png/action/help/materialicons/24dp/2x/baseline_help_black_24dp.png';
  }
}

// Format group key for better readability
function formatGroupKey(groupKey) {
  try {
    // GroupKey format: "{}:{alertname="value", label="value", ...}"
    // or "{namespace}:{label="value", ...}"

    // Parse all key-value pairs
    const labelRegex = /(\w+)="([^"]+)"/g;
    const labels = [];
    let match;

    while ((match = labelRegex.exec(groupKey)) !== null) {
      labels.push(`• ${match[1]}: ${match[2]}`);
    }

    // Return formatted list or original if parsing fails
    return labels.length > 0 ? labels.join('\n') : groupKey;
  } catch (error) {
    console.error('Error formatting groupKey:', error);
    return groupKey; // Return original if parsing fails
  }
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
