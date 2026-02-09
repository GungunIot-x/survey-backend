const express = require('express');
const axios = require('axios');

const app = express();

// === Bulletproof CORS (fixes preflight / OPTIONS) ===
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // '*' for testing; later change to 'https://iot-x.zendesk.com'
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request (browser always sends OPTIONS first)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  next();
});

app.use(express.json());

// === Zendesk Configuration ===
const ZENDESK_SUBDOMAIN = 'con-acmesolution';
const ZENDESK_ADMIN_EMAIL = 'gungun.aswani@iot-x.io';
const ZENDESK_TOKEN = process.env.ZENDESK_TOKEN;

// === Debug: Check token at startup ===
if (!ZENDESK_TOKEN) {
  console.error('FATAL ERROR: ZENDESK_TOKEN environment variable is NOT set in Vercel!');
  console.error('Go to Vercel → Settings → Environment Variables → Add ZENDESK_TOKEN');
} else {
  console.log('ZENDESK_TOKEN loaded successfully (length: ' + ZENDESK_TOKEN.length + ' characters)');
}
console.log('Using Zendesk subdomain:', ZENDESK_SUBDOMAIN);
console.log('Admin email:', ZENDESK_ADMIN_EMAIL);

// Custom field IDs
const RATING_FIELD_ID = 33041185023122;
const POSITIVE_FIELD_ID = 33041276291218;
const IMPROVEMENT_FIELD_ID = 33041265803026;

// === Helper functions ===
function getRatingTag(rating) {
  const map = {
    "1": "very_dissatisfied",
    "2": "dissatisfied",
    "3": "neutral",
    "4": "satisfied",
    "5": "very_satisfied"
  };
  return map[rating] || "";
}

function getSatisfactionTags(rating) {
  if (rating === "5") return ["csat-5", "csat-positive"];
  if (rating === "4") return ["csat-4", "csat-positive"];
  if (rating === "3") return ["csat-3", "csat-neutral"];
  if (rating === "2") return ["csat-2", "csat-negative"];
  if (rating === "1") return ["csat-1", "csat-negative"];
  return [];
}

function getRatingText(rating) {
  const map = {
    "1": "Very dissatisfied",
    "2": "Dissatisfied",
    "3": "Neutral",
    "4": "Satisfied",
    "5": "Very satisfied"
  };
  return map[rating] || "Unknown";
}

// === Main endpoint ===
app.post('/submit-survey', async (req, res) => {
  const { ticketId, rating, positive, improvement, userEmail } = req.body;

  // Basic validation
  if (!ticketId || !rating) {
    console.log('Validation failed: missing ticketId or rating');
    return res.status(400).json({ success: false, message: 'Missing ticketId or rating' });
  }

  console.log(`Received survey data for ticket #${ticketId} | Rating: ${rating} | Email: ${userEmail || 'anonymous'}`);

  try {
    // 1. Update Ticket
    const ratingTag = getRatingTag(rating);
    const satisfactionTags = getSatisfactionTags(rating);
    const commentBody = `Customer Feedback Survey:\n` +
                        `Rating: ${rating}/5 – ${getRatingText(rating)}\n` +
                        `What went well: ${positive || '—'}\n` +
                        `What can we improve: ${improvement}`;

    console.log('Attempting to update ticket...');

    const ticketResponse = await axios.put(
      `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/tickets/${ticketId}.json`,
      {
        ticket: {
          custom_fields: [
            { id: RATING_FIELD_ID, value: ratingTag },
            { id: POSITIVE_FIELD_ID, value: positive || '' },
            { id: IMPROVEMENT_FIELD_ID, value: improvement }
          ],
          tags: satisfactionTags,
          comment: { body: commentBody, public: false }
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        auth: {
          username: `${ZENDESK_ADMIN_EMAIL}/token`,
          password: ZENDESK_TOKEN
        }
      }
    );

    console.log('Ticket updated successfully:', ticketResponse.status);

    // 2. Create Custom Event
    console.log('Creating custom event...');

    const eventPayload = {
      profile: {
        source: 'help_center_survey',
        type: 'customer',
        identifiers: [{ type: 'email', value: userEmail || 'anonymous@example.com' }]
      },
      event: {
        source: 'help_center_survey',
        type: 'survey_submitted',
        description: `Survey submitted for ticket #${ticketId}`,
        properties: {
          rating: rating,
          positive_feedback: positive,
          improvement_suggestions: improvement,
          ticket_id: ticketId,
          submitted_at: new Date().toISOString()
        }
      }
    };

    const eventResponse = await axios.post(
      `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/user_profiles/events`,
      eventPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        auth: {
          username: `${ZENDESK_ADMIN_EMAIL}/token`,
          password: ZENDESK_TOKEN
        }
      }
    );

    console.log('Custom event created successfully:', eventResponse.status);

    // Final success
    res.json({ success: true, message: 'Survey submitted and tracked successfully' });
  } catch (error) {
    console.error('Error in /submit-survey:', error.message);

    if (error.response) {
      console.error('Zendesk API failed with status:', error.response.status);
      console.error('Zendesk error details:', error.response.data);
    } else if (error.request) {
      console.error('No response from Zendesk. Request details:', error.request);
    } else {
      console.error('Unexpected error:', error.message);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit survey',
      error: error.message,
      zendeskStatus: error.response?.status || 'unknown'
    });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
