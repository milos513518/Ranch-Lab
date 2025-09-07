// api/webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

async function sendConfirmationEmail(session) {
  try {
    const metadata = session.metadata;
    const cartItems = JSON.parse(metadata.cartItems || '[]');
    
    // Create order summary HTML
    const itemsList = cartItems.map(item => 
      `<li>${item.name} x${item.qty} - $${(item.price * item.qty).toFixed(2)}</li>`
    ).join('');
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6d28d9;">Order Confirmation - Ranch Lab</h1>
        
        <p>Hi ${metadata.customerName},</p>
        
        <p>Thank you for your order! We've received your payment and will have your food ready for ${metadata.orderType}.</p>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Order Details</h3>
          <p><strong>Order Type:</strong> ${metadata.orderType === 'pickup' ? 'Pickup' : 'Delivery'}</p>
          <p><strong>Time:</strong> ${metadata.slot}</p>
          <p><strong>Phone:</strong> ${metadata.customerPhone}</p>
          
          ${metadata.orderType === 'pickup' ? 
            '<p><strong>Pickup Address:</strong><br>964 Rose Ave, Piedmont, CA 94611</p>' : 
            '<p><strong>Note:</strong> Your order will be ready for Uber pickup at the scheduled time.</p>'
          }
        </div>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Items Ordered</h3>
          <ul style="list-style: none; padding: 0;">
            ${itemsList}
          </ul>
          <p style="font-weight: bold; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 10px;">
            Total Paid: $${(session.amount_total / 100).toFixed(2)}
          </p>
        </div>
        
        <p>Questions? Reply to this email or call us at (310) 666-0797.</p>
        
        <p>Thanks,<br>Milos & the Ranch Lab team</p>
      </div>
    `;

    await resend.emails.send({
      from: 'Ranch Lab <orders@ranchlab.is>',
      to: [session.customer_email],
      subject: `Order Confirmation - Ranch Lab (${metadata.orderType})`,
      html: emailHtml,
    });

    console.log('Confirmation email sent to:', session.customer_email);
    
  } catch (error) {
    console.error('Error sending confirmation email:', error);
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

  let event;

  try {
    const body = JSON.stringify(req.body);
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
