import cron from 'node-cron'
import { runTrialExpiryScheduler } from './trial-expiry.scheduler'

// Lance le scheduler toutes les heures
cron.schedule('0 * * * *', () => {
  runTrialExpiryScheduler()
    .then(() => console.info('[TrialScheduler] Cron run finished.'))
    .catch((error) => console.error('[TrialScheduler] Cron run error:', error))
})
