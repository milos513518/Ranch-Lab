// /api/checkout.js
import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { cartItems, orderType, slot, customer } = req.body || {};

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).send("No items in cart.");
  }

  const line_items = cartItems.map((i) => ({
    price_data: {
      currency: "usd",
      product_data: { name: i.name },
      unit_amount: Math.round(Number(i.price) * 100), // dollars -> cents
    },
    quantity: Number(i.quantity) || 1,
  }));

  const metadata = {
    orderType: orderType || "",
    slot: slot || "",
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
  };

  const origin =
    req.headers.origin ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,

      // 👇 ensures webhook has an email to send to
      customer_email: customer?.email || undefined,
      customer_creation: "always",

      billing_address_collection: "auto", // optional but useful
      success_url: `${origin}/?status=success`,
      cancel_url: `${origin}/?status=cancel`,
      metadata,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("Stripe error creating checkout session:", e);
    res.status(500).send("Stripe error creating checkout session");
  }
}
