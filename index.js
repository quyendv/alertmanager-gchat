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
    const chatMessage = transformAlertToGoogleChat(req.body);

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
function transformAlertToGoogleChat(payload) {
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
