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
              <p>Thank you for your order and welcome to Ranch Lab culinary exploration.</p>
              <p>Here are your order details:</p>
              
              <h3>Order Summary</h3>
              <!-- Order summary -->
              <table width="100%" style="border-collapse:collapse; margin:20px 0;">
                <thead>
                  <tr style="background:#f3f3f3;">
                    <th align="left" style="padding:10px; border-bottom:1px solid #ddd;">Item</th>
                    <th align="right" style="padding:10px; border-bottom:1px solid #ddd;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${(session.line_items || [])
                    .map(
                      (item) => `
                      <tr>
                        <td style="padding:10px; border-bottom:1px solid #eee;">${item.description}</td>
                        <td align="right" style="padding:10px; border-bottom:1px solid #eee;">$${(
                          item.amount_total / 100
                        ).toFixed(2)}</td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
              <p><strong>Total: $${(session.amount_total / 100).toFixed(2)}</strong></p>
              
              <!-- Pickup/Delivery Information -->
              <h3>Pickup/Delivery Information</h3>
              <div style="background:#f9f9f9; padding:15px; margin:20px 0; border-radius:5px;">
                <p><strong>Customer:</strong> ${session.customer_details?.name || "N/A"}</p>
                <p><strong>Email:</strong> ${session.customer_email || "N/A"}</p>
                <p><strong>Phone:</strong> ${session.customer_details?.phone || "N/A"}</p>
                ${session.shipping ? `
                <p><strong>Delivery Address:</strong><br/>
                ${session.shipping.address?.line1 || ""}<br/>
                ${session.shipping.address?.city || ""}, ${session.shipping.address?.state || ""} ${session.shipping.address?.postal_code || ""}</p>
                ` : `
                <p><strong>Pickup Location:</strong> Ranch Lab, San Francisco, CA</p>
                `}
              </div>
              
              <p>We'll send another update once your order is ready.</p>
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
