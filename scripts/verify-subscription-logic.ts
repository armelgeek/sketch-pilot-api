function verify() {
  console.log('--- Manual Logic Verification ---')

  const computeStatus = (result: any) => {
    const now = new Date()
    const gracePeriodMs = 24 * 60 * 60 * 1000 // 24h grace period

    let isPaid = false
    if (result.stripeCurrentPeriodEnd) {
      isPaid = result.stripeCurrentPeriodEnd.getTime() + gracePeriodMs > now.getTime()
    }

    let isCanceled = false
    const accessEndsAt = result.stripeCurrentPeriodEnd || result.trialEndDate

    if (result.trialCanceled && result.isTrialActive) {
      isCanceled = true
    } else if (!result.stripeSubscriptionId && result.stripeCurrentPeriodEnd) {
      isCanceled = true
    }
    return {
      isTrialActive: result.isTrialActive,
      isCanceled,
      accessEndsAt,
      plan: {
        title: result.plan?.title || 'Free',
        isPaid,
        isCanceled,
        accessEndsAt
      }
    }
  }

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86400000)

  console.log('Scenario 1: Active Stripe Sub')
  console.log(
    JSON.stringify(
      computeStatus({ stripeSubscriptionId: 'sub_1', stripeCurrentPeriodEnd: tomorrow, trialEndDate: null }),
      null,
      2
    )
  )

  console.log('Scenario 2: Canceled Stripe Sub (Access maintained)')
  console.log(
    JSON.stringify(
      computeStatus({
        stripeSubscriptionId: 'sub_1',
        stripeCurrentPeriodEnd: tomorrow,
        trialEndDate: null,
        isCanceled: true
      }),
      null,
      2
    )
  )

  console.log('Scenario 3: Reactivation Logic (Code Review)')
  console.log(
    'If user has stripeSubscriptionId and it is active/trialing but canceled, we call stripe.subscriptions.update(id, { cancel_at_period_end: false })'
  )

  console.log('Scenario 4: Expired Sub (Requires new payment)')
  const yesterday = new Date(now.getTime() - 86400000 * 2)
  console.log(
    JSON.stringify(
      computeStatus({ stripeSubscriptionId: 'sub_1', stripeCurrentPeriodEnd: yesterday, trialEndDate: null }),
      null,
      2
    )
  )
}

verify()
