const { Resend } = require('resend');
const Stripe = require('stripe');

const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Skip signature verification for now
  const event = req.body;

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      // Retrieve the full session with expanded line items
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items', 'line_items.data.price.product']
      });

      // Send confirmation email
      await resend.emails.send({
        from: "Ranch Lab <orders@ranchlab.is>",
        to: [session.customer_email],
        subject: "Your Ranch Lab Order Confirmation",
        html: `
        <div style="font-family: Arial, sans-serif; background:#f9f9f9; padding:20px;">
          <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
            
            <!-- Header with Logo -->
            <div style="background:#ffffff; padding:20px; text-align:center;">
              <img src="https://ranchlab.is/assets/logo.png" alt="Ranch Lab" width="100" height="100" style="border-radius:12px;" />
            </div>
            <!-- Body -->
            <div style="padding:20px; color:#333;">
              <h2 style="margin-top:0;">Thank you for your order!</h2>
              <p>Hi ${session.customer_details?.name?.split(' ')[0] || "friend"},</p>
              <p>Thank you for your order and welcome to Ranch Lab culinary exploration!</p>
              
              <h3>Order Summary</h3>
              <!-- Order summary -->
              <table width="100%" style="border-collapse:collapse; margin:20px 0;">
                <tbody>
                  ${(fullSession.line_items?.data || [])
                    .map(
                      (item) => `
                      <tr>
                        <td style="padding:10px; border-bottom:1px solid #eee;">
                          ${item.price?.product?.name || item.description} 
                          ${item.quantity > 1 ? ` (x${item.quantity})` : ''}
                        </td>
                        <td align="right" style="padding:10px; border-bottom:1px solid #eee;">
                          $${((item.amount_total || 0) / 100).toFixed(2)}
                        </td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
              <p><strong>Total: $${(session.amount_total / 100).toFixed(2)}</strong></p>
              
              <!-- Pickup/Delivery Information -->
              <h3>${session.metadata?.fulfillment_type === 'pickup' ? 'Pickup' : session.metadata?.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup/Delivery Information'}</h3>
              <div style="background:#f9f9f9; padding:15px; margin:20px 0; border-radius:5px;">
                ${session.metadata?.fulfillment_type === 'pickup' ? `
                  <p style="font-style:italic; margin-bottom:15px;">Selecting a pickup time helps us have your order ready.</p>
                  <p><strong>Selected Date:</strong> ${session.metadata?.pickup_date || 'Not specified'}</p>
                  <p><strong>Selected Time:</strong> ${session.metadata?.pickup_time || 'Not specified'}</p>
                  <p><strong>Pick Up Address:</strong><br/>
                  ${session.metadata?.pickup_address || '964 Rose Ave, Piedmont, CA 94611'}</p>
                ` : session.metadata?.fulfillment_type === 'delivery' ? `
                  <p><strong>Selected Date:</strong> ${session.metadata?.delivery_date || 'Not specified'}</p>
                  <p><strong>Selected Time:</strong> ${session.metadata?.delivery_time || 'Not specified'}</p>
                  <p><strong>Pick Up Address:</strong><br/>
                  ${session.metadata?.pickup_address || '964 Rose Ave, Piedmont, CA 94611'}</p>
                  
                  <!-- Schedule Uber Button -->
                  <div style="text-align:center; margin:20px 0;">
                    <a href="https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=964%20Rose%20Ave%2C%20Piedmont%2C%20CA%2094611" 
                       style="background:#000000; color:#ffffff; padding:12px 24px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:bold;">
                       Schedule Uber Courier
                    </a>
                  </div>
                  
                  <p style="margin-top:15px; font-size:12px; color:#666;">
                  After clicking "Schedule Uber Courier", you'll need to reserve your ride by clicking the "Pick Up Now" button in the Uber app. 
                  Use the "Copy Pick Up Address" button above to easily paste the address into Uber's pickup field.
                  </p>
                ` : `
                  <p><strong>Pickup Location:</strong> Ranch Lab, San Francisco, CA</p>
                  <p style="margin-top:15px; font-style:italic; color:#666;">
                  Note: To display pickup/delivery scheduling details, please select pickup or delivery option during checkout.
                  </p>
                `}
              </div>
              
              <p>With gratitude,<br/>Milos</p>
            </div>
            <!-- Footer -->
            <div style="background:#f3f3f3; padding:15px; text-align:center; font-size:12px; color:#777;">
              <p>Ranch Lab, San Francisco, CA</p>
              <p><a href="https://ranchlab.is" style="color:#B22222; text-decoration:none;">Visit our website</a></p>
            </div>
          </div>
        </div>
        `,
      });

      console.log('Email sent successfully for session:', session.id);
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Still return 200 to acknowledge webhook receipt
    }
  }

  // Return 200 to acknowledge receipt of the event
  res.status(200).json({ received: true });
};
