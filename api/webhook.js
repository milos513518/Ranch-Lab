// api/webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

export const config = {
  api: {
    bodyParser: false, // Important: disable Vercel's body parser
  },
};

async function sendConfirmationEmail(session) {
  try {
    const metadata = session.metadata || {};
    const customerName = metadata.customerName || 'Customer';
    const customerPhone = metadata.customerPhone || 'Not provided';
    const orderType = metadata.orderType || 'pickup';
    const slot = metadata.slot || 'Not specified';
    const cartItems = JSON.parse(metadata.cartItems || '[]');
    
    // Create order summary HTML
    const itemsList = cartItems.map(item => 
      `<li style="padding: 8px 0; border-bottom: 1px solid #ffe0b2; color: #bf360c;">${item.name} x${item.qty} - $${(item.price * item.qty).toFixed(2)}</li>`
    ).join('');
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #fff8f0 0%, #fff3e0 100%); border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%); padding: 30px; text-align: center;">
          <img src="https://i.imgur.com/CxUwX5E.png" alt="Ranch Lab" style="max-width: 200px; height: auto; margin-bottom: 16px;" />
          <p style="color: #fff3e0; margin: 8px 0; font-size: 16px;">Fire-inspired cooking crafted from my travels</p>
        </div>
        
        <div style="padding: 30px;">
          <h2 style="color: #bf360c; margin: 0 0 20px; font-size: 24px;">Order Confirmed!</h2>
          
          <p style="color: #5d4037; font-size: 16px; line-height: 1.6;">Hi ${customerName},</p>
          
          <p style="color: #5d4037; font-size: 16px; line-height: 1.6;">Thank you for your order! We've received your payment and will have your food ready for ${orderType}.</p>
          
          <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 6px solid #ff6b35; box-shadow: 0 2px 8px rgba(255,107,53,0.15);">
            <h3 style="color: #bf360c; margin: 0 0 16px; font-size: 20px;">Order Details</h3>
            <p style="margin: 8px 0; color: #5d4037;"><strong>Order Type:</strong> ${orderType === 'pickup' ? 'Pickup' : 'Delivery'}</p>
            <p style="margin: 8px 0; color: #5d4037;"><strong>Time:</strong> ${slot}</p>
            <p style="margin: 8px 0; color: #5d4037;"><strong>Phone:</strong> ${customerPhone}</p>
            
            ${orderType === 'pickup' ? 
              '<p style="margin: 12px 0; color: #5d4037;"><strong>Pickup Address:</strong><br>964 Rose Ave, Piedmont, CA 94611</p>' : 
              '<p style="margin: 12px 0; color: #5d4037;"><strong>Note:</strong> Your order will be ready for Uber pickup at the scheduled time.</p>'
            }
          </div>
          
          <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 6px solid #ff8c42; box-shadow: 0 2px 8px rgba(255,140,66,0.15);">
            <h3 style="color: #bf360c; margin: 0 0 16px; font-size: 20px;">Items Ordered</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${itemsList}
            </ul>
            <div style="border-top: 3px solid #ff6b35; padding-top: 16px; margin-top: 16px;">
              <p style="font-weight: bold; font-size: 18px; color: #bf360c; margin: 0;">
                Total Paid: $${(session.amount_total / 100).toFixed(2)}
              </p>
            </div>
          </div>
          
          <div style="background: linear-gradient(135deg, #ff8c42 0%, #ffa726 100%); padding: 20px; border-radius: 8px; margin: 24px 0; text-align: center;">
            <p style="color: white; margin: 0; font-size: 16px;">Questions? Reply to this email or call us at <strong>(310) 666-0797</strong></p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #bf360c; font-size: 18px; font-weight: bold; margin: 0;">Thanks,</p>
            <p style="color: #ff6b35; font-size: 20px; font-weight: bold; margin: 8px 0;">Milos & the Ranch Lab team</p>
          </div>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: 'Ranch Lab <onboarding@resend.dev>',
      to: [session.customer_email],
      subject: `Order Confirmation - Ranch Lab (${orderType})`,
      html: emailHtml,
    });

    console.log('Confirmation email sent successfully to:', session.customer_email);
    
  } catch (error) {
    console.error('CRITICAL: Failed to send confirmation email:', {
      error: error.message,
      customerEmail: session.customer_email,
      sessionId: session.id
    });
    // Don't throw - we don't want to fail the webhook if email fails
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;

  try {
    // Get raw body for Stripe signature verification
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      console.log('Payment succeeded:', {
        sessionId: session.id,
        customerEmail: session.customer_email,
        amountTotal: session.amount_total,
        metadata: session.metadata
      });

      // Send confirmation email
      await sendConfirmationEmail(session);
      
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.status(200).json({ received: true });
}
