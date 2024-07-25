import { get, patch } from 'axios';

// Use environment variables for the API key
const klaviyoAPIKey = process.env.YOUR_KLAVIYO_PRIVATE_API_KEY;

// Function to get events for a profile using profile ID
async function getEventsByProfileId(profileId) {
  const eventsEndpoint = 'https://a.klaviyo.com/api/events/';
  console.log(`Fetching events for profile ID: ${profileId}`);

  try {
    const response = await get(eventsEndpoint, {
      params: {
        filter: `equals(profile_id,'${profileId}')`,
      },
      headers: {
        accept: 'application/json',
        revision: '2024-07-15',
        Authorization: `Klaviyo-API-Key ${klaviyoAPIKey}`,
      },
    });

    console.log('Events response:', response.data);
    return response.data;
  } catch (error) {
    console.error(`Error fetching events: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    throw error;
  }
}

// Function to get metric by ID
async function getMetricById(metricId) {
  const metricEndpoint = `https://a.klaviyo.com/api/metrics/${metricId}`;
  console.log(`Fetching metric ID: ${metricId}`);

  try {
    const response = await get(metricEndpoint, {
      headers: {
        accept: 'application/json',
        revision: '2024-07-15',
        Authorization: `Klaviyo-API-Key ${klaviyoAPIKey}`,
      },
    });

    console.log('Metric response:', response.data);
    return response.data.data.attributes.name;
  } catch (error) {
    console.error(`Error fetching metric: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    throw error;
  }
}

// Function to calculate days between two dates
function calculateDaysBetween(date1, date2) {
  const diffTime = Math.abs(new Date(date2) - new Date(date1));
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  console.log(`Calculated days between: ${diffDays}`);
  return diffDays;
}

// Function to update profile with custom property using profile ID
async function updateProfileById(profileId, daysBetween) {
  const updateEndpoint = `https://a.klaviyo.com/api/profiles/${profileId}`;
  console.log(`Updating profile ID: ${profileId} with daysBetween: ${daysBetween}`);

  try {
    const response = await patch(updateEndpoint, {
      data: {
        id: profileId,
        type: "profile",
        attributes: {
          properties: {
            time_between_subscribed_and_placed_order: daysBetween,
          },
        },
      },
    }, {
      headers: {
        accept: 'application/json',
        revision: '2024-07-15',
        Authorization: `Klaviyo-API-Key ${klaviyoAPIKey}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Update response:', response.data);
  } catch (error) {
    console.error(`Error updating profile: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    throw error;
  }
}


// Main function to perform the task
async function main(profileId) {
  try {
    console.log(`Processing profile ID: ${profileId}`);
    
    const response = await getEventsByProfileId(profileId);
    const events = response.data;
    console.log(`Events for profile ID ${profileId}:`, events);

    // Map metrics by ID to their names
    const metricMap = {};
    for (const event of events) {
      const metricId = event.relationships.metric.data.id;
      if (!metricMap[metricId]) {
        const metricName = await getMetricById(metricId);
        metricMap[metricId] = metricName;
      }
      console.log(`Event ID: ${event.id}, Metric ID: ${metricId}, Metric Name: ${metricMap[metricId]}`);
    }

    // Find the first Subscribed event
    const subscribedEvent = events.find(event => 
      event.relationships && 
      event.relationships.metric &&
      event.relationships.metric.data &&
      metricMap[event.relationships.metric.data.id] === 'Subscribed to Email Marketing'
    );

    if (!subscribedEvent) {
      console.log(`Subscribed event not found for profile ID ${profileId}`);
      throw new Error('Subscribed event not found');
    }
    console.log(`Subscribed event found for profile ID ${profileId}:`, subscribedEvent);

    // Find the first Placed Order event after the Subscribed event
    const placedOrderEvent = events.find(event => 
      event.relationships && 
      event.relationships.metric &&
      event.relationships.metric.data &&
      metricMap[event.relationships.metric.data.id] === 'Placed Order' && 
      new Date(event.attributes.datetime) > new Date(subscribedEvent.attributes.datetime)
    );

    if (!placedOrderEvent) {
      console.log(`Placed Order event not found after Subscribed event for profile ID ${profileId}`);
      throw new Error('Placed Order event not found after Subscribed event');
    }
    console.log(`Placed Order event found for profile ID ${profileId}:`, placedOrderEvent);

    const daysBetween = calculateDaysBetween(subscribedEvent.attributes.datetime, placedOrderEvent.attributes.datetime);
    await updateProfileById(profileId, daysBetween);
    console.log(`Profile with ID ${profileId} updated with ${daysBetween} days between Subscribed and Placed Order.`);
  } catch (error) {
    console.error(`Error processing profile ID ${profileId}: ${error.message}`);
    throw error;
  }
}

// Handle incoming webhook
export default async function (req, res) {
  const { email, profileId } = req.body;

  if (!profileId) {
    console.error('Profile ID is required');
    return res.status(400).json({ status: 'error', message: 'Profile ID is required' });
  }

  try {
    await main(profileId);
    res.status(200).json({ status: 'success', message: `Profile with ID ${profileId} processed successfully.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: error.message });
  }
}
