const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Explicit CORS headers - this fixes the preflight (OPTIONS) issue
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // or change to 'https://iot-x.zendesk.com' for more security
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS requests (very important for CORS)
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());

// Zendesk credentials (token from env variable)
const zendeskSubdomain = 'con-acmesolution';
const apiToken = process.env.ZENDESK_TOKEN;
const adminEmail = 'gungun.aswani@iot-x.io';

// Custom field IDs from your code
const ratingFieldId = 33041185023122;
const positiveFieldId = 33041276291218;
const improvementFieldId = 33041265803026;

// Route to handle survey submission
app.post('/submit-survey', async (req, res) => {
  const { ticketId, rating, positive, improvement, userEmail } = req.body;

  // Basic validation
  if (!ticketId || !rating) {
    return res.status(400).json({ success: false, message: 'Missing ticketId or rating' });
  }

  try {
    console.log('Received survey data:', { ticketId, rating, userEmail });

    // 1. Update Ticket
    const ratingTag = getRatingTag(rating);
    const satisfactionTags = getSatisfactionTags(rating);
    const commentBody = `Customer Feedback Survey:\nRating: ${rating}/5 – ${ratingText(rating)}\nWhat went well: ${positive || '—'}\nWhat can we improve: ${improvement}`;

    await axios.put(
      `https://${zendeskSubdomain}.zendesk.com/api/v2/tickets/${ticketId}.json`,
      {
        ticket: {
          custom_fields: [
            { id: ratingFieldId, value: ratingTag },
            { id: positiveFieldId, value: positive || '' },
            { id: improvementFieldId, value: improvement }
          ],
          tags: satisfactionTags,
          comment: { body: commentBody, public: false }
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        auth: { username: `${adminEmail}/token`, password: apiToken }
      }
    );

    console.log('Ticket updated successfully');

    // 2. Create Custom Event
    const payload = {
      profile: {
        source: 'help_center_survey',
        type: 'customer',
        identifiers: [{ type: 'email', value: userEmail || 'anonymous@example.com' }]
      },
      event: {
        source: 'help_center_survey',
        type: 'survey_submitted',
        description: 'Customer submitted feedback survey for ticket #' + ticketId,
        properties: {
          rating: rating,
          positive: positive,
          improvement: improvement,
          ticket_id: ticketId,
          submitted_at: new Date().toISOString()
        }
      }
    };

    await axios.post(
      `https://${zendeskSubdomain}.zendesk.com/api/v2/user_profiles/events`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        auth: { username: `${adminEmail}/token`, password: apiToken }
      }
    );

    console.log('Custom event created successfully');

    res.json({ success: true, message: 'Survey submitted and event tracked!' });
  } catch (error) {
    console.error('Error in /submit-survey:', error.message);
    if (error.response) {
      console.error('Zendesk response error:', error.response.data);
    }
    res.status(500).json({
      success: false,
      message: 'Error submitting survey',
      error: error.message
    });
  }
});

// Helper functions (must be defined before using them)
function getRatingTag(rating) {
  const tags = {
    "1": "very_dissatisfied",
    "2": "dissatisfied",
    "3": "neutral",
    "4": "satisfied",
    "5": "very_satisfied"
  };
  return tags[rating] || "";
}

function getSatisfactionTags(rating) {
  if (rating === "5") return ["csat-5", "csat-positive"];
  if (rating === "4") return ["csat-4", "csat-positive"];
  if (rating === "3") return ["csat-3", "csat-neutral"];
  if (rating === "2") return ["csat-2", "csat-negative"];
  if (rating === "1") return ["csat-1", "csat-negative"];
  return [];
}

function ratingText(rating) {
  return {
    "1": "Very dissatisfied",
    "2": "Dissatisfied",
    "3": "Neutral",
    "4": "Satisfied",
    "5": "Very satisfied"
  }[rating];
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
