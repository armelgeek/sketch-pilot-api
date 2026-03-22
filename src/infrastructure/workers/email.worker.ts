import process from 'node:process'
import { Worker, type Job } from 'bullmq'
import { emailTemplates, sendEmail } from '@/infrastructure/config/mail.config'
import { EMAIL_QUEUE_NAME, type EmailJobData } from '@/infrastructure/config/email-queue.config'

const NEWSLETTER_IDEAS = [
  'Les 3 habitudes des gens qui réussissent malgré tout',
  'Comment transformer un échec en carburant pour votre succès',
  'Les secrets des créateurs qui génèrent 1M de vues par mois'
]

const NEWSLETTER_HOOKS = [
  '98 % des gens abandonnent — voici pourquoi vous ne devriez pas',
  'Ce que les riches font à 5h du matin (et que personne ne vous dit)',
  'La vérité brutale sur le succès que personne ne veut entendre',
  "J'ai perdu tout mon argent — voici ce que j'ai appris",
  'Une seule habitude a changé ma vie en 30 jours'
]

const NEWSLETTER_SCRIPT_PREVIEW = `[ACCROCHE] Tu veux réussir ? Arrête de chercher la motivation.
[DÉVELOPPEMENT] La discipline bat la motivation chaque jour. Voici 3 preuves concrètes...
[APPEL À L'ACTION] Abonne-toi pour recevoir une nouvelle stratégie chaque semaine.`

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { template, userEmail, userName, data = {} } = job.data

  let emailContent: { subject: string; text: string } | null = null

  switch (template) {
    case 'welcome':
      emailContent = emailTemplates.welcome(userName)
      break

    case 'onboarding1':
      emailContent = emailTemplates.onboarding1(userName)
      break

    case 'onboarding2':
      emailContent = emailTemplates.onboarding2(userName)
      break

    case 'onboarding3':
      emailContent = emailTemplates.onboarding3(userName)
      break

    case 'nudge':
      emailContent = emailTemplates.nudge(userName)
      break

    case 'push_volume':
      emailContent = emailTemplates.pushVolume(userName)
      break

    case 'credits_low':
      emailContent = emailTemplates.creditsLow(userName, Number(data.creditsLeft ?? 1))
      break

    case 'trial_started':
      emailContent = emailTemplates.trialStarted(userName)
      break

    case 'trial_ending':
      emailContent = emailTemplates.trialEnding(userName, Number(data.daysLeft ?? 3))
      break

    case 'inactive':
      emailContent = emailTemplates.inactive(userName, Number(data.daysSinceActive ?? 3))
      break

    case 'newsletter':
      emailContent = emailTemplates.newsletter(
        userName,
        (data.ideas as string[]) ?? NEWSLETTER_IDEAS,
        (data.hooks as string[]) ?? NEWSLETTER_HOOKS,
        (data.scriptPreview as string) ?? NEWSLETTER_SCRIPT_PREVIEW
      )
      break

    default:
      console.warn(`[EmailWorker] Unknown template "${template}" for job ${job.id} — skipping`)
      return
  }

  await sendEmail({ to: userEmail, subject: emailContent.subject, text: emailContent.text })
  console.info(`[EmailWorker] Sent "${template}" to ${userEmail} (job ${job.id})`)
}

export function startEmailWorker(): Worker<EmailJobData> {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10)
  }

  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection,
    concurrency: 5
  })

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
  })

  console.info('[EmailWorker] Email worker started')
  return worker
}
