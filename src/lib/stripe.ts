import Stripe from "stripe";
import { PLANS } from "@/config/stripePlans";
import { db } from "./db";
import { currentUser } from "./auth";

export const stripe = new Stripe(
  process.env.STRIPE_ENV === "TEST"
    ? process.env.STRIPE_SECRET_KEY_TEST!
    : process.env.STRIPE_SECRET_KEY_PROD!,
  {
    apiVersion: "2023-10-16",
    typescript: true,
  }
);

export async function getUserSubscriptionPlan() {
  const user = await currentUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  if (!user.id) {
    return {
      ...PLANS[0],
      isSubscribed: false,
      isCanceled: false,
      stripeCurrentPeriodEnd: null,
    };
  }

  const dbUser = await db.user.findFirst({
    where: {
      id: user.id,
    },
  });

  if (!dbUser) {
    return {
      ...PLANS[0],
      isSubscribed: false,
      isCanceled: false,
      stripeCurrentPeriodEnd: null,
    };
  }

  const isSubscribed = Boolean(
    dbUser.stripePriceId &&
      dbUser.stripeCurrentPeriodEnd && // 86400000 = 1 day
      dbUser.stripeCurrentPeriodEnd.getTime() + 86_400_000 > Date.now()
  );

  const plan = isSubscribed
    ? PLANS.find(
        (plan) =>
          plan.price.onetime.priceIds[process.env.STRIPE_ENV === "PROD" ? "production" : "test"] ===
          dbUser.stripePriceId
      )
    : null;

  let isCanceled = false;
  if (isSubscribed && dbUser.stripeSubscriptionId) {
    const stripePlan = await stripe.subscriptions.retrieve(dbUser.stripeSubscriptionId);
    isCanceled = stripePlan.cancel_at_period_end;
  }

  return {
    ...plan,
    stripeSubscriptionId: dbUser.stripeSubscriptionId,
    stripeCurrentPeriodEnd: dbUser.stripeCurrentPeriodEnd,
    stripeCustomerId: dbUser.stripeCustomerId,
    isSubscribed,
    isCanceled,
  };
}

// For one time payments
export async function getUserPaymentStatus() {
  const user = await currentUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const dbUser = await db.user.findFirst({
    where: {
      id: user.id,
    },
  });

  if (!dbUser) {
    return false;
  }

  const isSubscribed = Boolean(dbUser.stripeCustomerId && dbUser.stripePaymentIntentId);

  return isSubscribed;
}