const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' })); // sab origins allow kar do (testing ke liye)
app.use(express.json());

// Environment variables se secure karo
const zendeskSubdomain = 'con-acmesolution';
const apiToken = process.env.ZENDESK_TOKEN || 'your-token-here'; // Vercel mein env add karna
const adminEmail = 'gungun.aswani@iot-x.io';

// Tere custom field IDs
const ratingFieldId = 33041185023122;
const positiveFieldId = 33041276291218;
const improvementFieldId = 33041265803026;

// Route
app.post('/submit-survey', async (req, res) => {
  const { ticketId, rating, positive, improvement, userEmail } = req.body;

  try {
    // Ticket update logic (tere code se copy)
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

    // Custom event
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
        properties: { rating, positive, improvement, ticket_id: ticketId }
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

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper functions
function getRatingTag(rating) { /* same as before */ }
function getSatisfactionTags(rating) { /* same */ }
function ratingText(rating) { /* same */ }

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Running on port ${port}`));
