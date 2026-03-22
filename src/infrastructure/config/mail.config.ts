import * as nodemailer from 'nodemailer'

type EmailParams = {
  to: string
  subject: string
  text?: string
  html?: string
}

const FROM_NAME = 'Meko Academy'
const FROM_EMAIL = 'contact@mekoacademy.com'

const transporter = nodemailer.createTransport({
  host: Bun.env.SMTP_HOST,
  port: Number.parseInt(Bun.env.SMTP_PORT || '587'),
  secure: false,
  requireTLS: true,
  auth: {
    user: Bun.env.SMTP_USER,
    pass: Bun.env.SMTP_PASSWORD
  },
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 60000,
  tls: {
    rejectUnauthorized: false
  }
})

export const emailTemplates = {
  deleteAccount(verificationUrl: string) {
    return {
      subject: 'Confirmation de suppression de compte',
      text: `Bonjour,

Nous avons reçu une demande de suppression de votre compte Meko Academy.

Pour confirmer cette action, veuillez cliquer sur le lien suivant:
${verificationUrl}

Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer ce message et contacter notre support.

Ce lien expirera dans 24 heures.

Cordialement,
L'équipe Meko Academy`
    }
  },

  verification(verificationUrl: string) {
    return {
      subject: 'Vérifiez votre adresse email',
      text: `Bonjour,

Merci de vous être inscrit à Meko Academy. Pour finaliser votre inscription, veuillez vérifier votre adresse email en cliquant sur le lien suivant:
${verificationUrl}

Ce lien expirera dans 24 heures.

Cordialement,
L'équipe Meko Academy`
    }
  },

  resetPassword(verificationUrl: string) {
    return {
      subject: 'Réinitialisation de votre mot de passe',
      text: `Bonjour,

Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte Meko Academy.

Pour créer un nouveau mot de passe, veuillez cliquer sur le lien suivant:
${verificationUrl}

Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer ce message.

Ce lien expirera dans 24 heures.

Cordialement,
L'équipe Meko Academy`
    }
  },

  changeEmail(verificationUrl: string) {
    return {
      subject: "Vérification du changement d'email",
      text: `Bonjour,

Nous avons reçu une demande de changement d'adresse email pour votre compte Meko Academy.

Pour confirmer cette nouvelle adresse email, veuillez cliquer sur le lien suivant:
${verificationUrl}

Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer ce message et contacter notre support.

Ce lien expirera dans 24 heures.

Cordialement,
L'équipe Meko Academy`
    }
  },

  otpLogin(otpCode: string) {
    return {
      subject: 'Votre code de connexion - Meko Academy',
      text: `Bonjour,

Voici votre code de connexion à 4 chiffres pour Meko Academy :

    ${otpCode}

Ce code est valable pendant 10 minutes.

⚠️ Ne partagez jamais ce code avec quelqu'un d'autre. Meko Academy ne vous le demandera jamais par message.

Si vous n'avez pas demandé ce code, vous pouvez ignorer cet email.

Cordialement,
L'équipe Meko Academy`
    }
  },

  paymentSucceeded(name: string) {
    return {
      subject: 'Paiement réussi pour votre abonnement Meko Academy',
      text: `Bonjour ${name},

Nous vous informons que votre paiement a été traité avec succès. Vous avez maintenant accès à toutes les fonctionnalités de votre abonnement.

Nous vous remercions de votre confiance.

Cordialement,
L'équipe Meko Academy`
    }
  },

  // ── SaaS lifecycle emails ──────────────────────────────────────────────────

  welcome(name: string) {
    return {
      subject: '🎬 Bienvenue — générez votre première vidéo maintenant',
      text: `Bonjour ${name},

Bienvenue sur la plateforme ! Vous êtes prêt à créer vos premières vidéos faceless motivation.

👉 Connectez-vous dès maintenant et générez votre première vidéo en moins de 2 minutes.

Voici comment démarrer :
1. Choisissez un sujet motivationnel
2. Laissez l'IA générer le script et les visuels
3. Téléchargez et publiez sur vos réseaux

C'est le moment de vous lancer !

Cordialement,
L'équipe`
    }
  },

  onboarding1(name: string) {
    return {
      subject: '🎨 Jour 1 — Découvrez les styles de vidéos qui cartonnent',
      text: `Bonjour ${name},

Hier vous avez rejoint notre plateforme. Aujourd'hui, découvrez les styles qui génèrent le plus de vues.

Les 3 styles qui fonctionnent le mieux :
• Citations motivationnelles avec fond animé
• Histoires de réussite avec narration IA
• Conseils de productivité en format court

👉 Essayez l'un de ces styles dès aujourd'hui pour votre première vidéo.

Cordialement,
L'équipe`
    }
  },

  onboarding2(name: string) {
    return {
      subject: '🔥 Jour 2 — La structure virale en 3 actes',
      text: `Bonjour ${name},

La structure qui fait exploser les vues sur les vidéos faceless :

Acte 1 — Accroche (0-5s) : posez une question ou une affirmation choc
Acte 2 — Développement (5-45s) : 3 points clés avec exemples concrets
Acte 3 — Appel à l'action (45-60s) : invitez à s'abonner ou à commenter

👉 Notre IA applique automatiquement cette structure. Générez une vidéo maintenant !

Cordialement,
L'équipe`
    }
  },

  onboarding3(name: string) {
    return {
      subject: '📤 Jour 3 — Comment distribuer vos vidéos efficacement',
      text: `Bonjour ${name},

Votre vidéo est prête. Maintenant, maximisez sa portée :

Plateformes prioritaires :
• TikTok : publiez entre 18h et 21h
• Instagram Reels : hashtags de niche + musique tendance
• YouTube Shorts : titre accrocheur avec mot-clé principal

Conseil pro : recyclez chaque vidéo sur 3 plateformes différentes pour tripler votre visibilité.

👉 Générez votre prochaine vidéo et dominez votre niche !

Cordialement,
L'équipe`
    }
  },

  nudge(name: string) {
    return {
      subject: "⏰ Vous n'avez pas encore généré de vidéo — c'est facile !",
      text: `Bonjour ${name},

Vous vous êtes inscrit hier, mais vous n'avez pas encore généré votre première vidéo.

Bonne nouvelle : ça prend moins de 2 minutes. Vraiment.

👉 Choisissez un sujet (ex : "Les 3 habitudes des gens qui réussissent") et laissez l'IA faire le reste.

Ne laissez pas cette opportunité vous échapper. Vos concurrents publient pendant que vous attendez.

Cordialement,
L'équipe`
    }
  },

  pushVolume(name: string) {
    return {
      subject: '🚀 Votre première vidéo est générée — et maintenant ?',
      text: `Bonjour ${name},

Félicitations pour votre première vidéo ! Vous avez franchi le premier cap.

Les créateurs qui réussissent publient en moyenne 3 à 5 vidéos par semaine. Plus vous publiez, plus l'algorithme vous favorise.

Idées de sujets pour vos prochaines vidéos :
• "Comment se lever tôt et rester discipliné"
• "Les 5 erreurs qui sabotent votre succès"
• "Pourquoi les riches pensent différemment"

👉 Générez votre prochaine vidéo maintenant et construisez votre audience !

Cordialement,
L'équipe`
    }
  },

  creditsLow(name: string, creditsLeft: number) {
    return {
      subject: `⚠️ Il vous reste ${creditsLeft} crédit(s) — rechargez maintenant`,
      text: `Bonjour ${name},

Attention : il ne vous reste que ${creditsLeft} crédit(s) sur votre compte.

Ne laissez pas votre chaîne s'arrêter. Rechargez vos crédits et continuez à publier sans interruption.

👉 Rechargez vos crédits dès maintenant pour continuer à créer du contenu viral.

Cordialement,
L'équipe`
    }
  },

  trialEnding(name: string, daysLeft: number) {
    return {
      subject: `⏳ Votre essai se termine dans ${daysLeft} jour(s)`,
      text: `Bonjour ${name},

Votre période d'essai se termine dans ${daysLeft} jour(s).

Ne perdez pas accès à vos vidéos et à votre historique. Passez à un abonnement payant maintenant et continuez à créer sans limite.

Avantages de l'abonnement :
• Vidéos illimitées chaque mois
• Accès aux styles premium
• Support prioritaire

👉 Activez votre abonnement avant la fin de votre essai.

Cordialement,
L'équipe`
    }
  },

  trialStarted(name: string) {
    return {
      subject: '🎉 Votre essai a commencé — profitez-en au maximum',
      text: `Bonjour ${name},

Votre période d'essai vient de démarrer. Vous avez maintenant accès à toutes les fonctionnalités de la plateforme.

Voici ce que vous pouvez faire pendant votre essai :
• Générez autant de vidéos que vous voulez
• Testez tous les styles et formats disponibles
• Publiez sur TikTok, Instagram et YouTube

Conseil : générez au moins 3 vidéos cette semaine pour vraiment ressentir la puissance de la plateforme.

👉 Commencez dès maintenant et créez votre première vidéo virale !

Cordialement,
L'équipe`
    }
  },

  inactive(name: string, daysSinceActive: number) {
    return {
      subject: `😴 Ça fait ${daysSinceActive} jours — vos concurrents avancent`,
      text: `Bonjour ${name},

Vous n'avez pas créé de vidéo depuis ${daysSinceActive} jours. Pendant ce temps, vos concurrents continuent à publier et à grandir.

La régularité est la clé du succès sur les réseaux sociaux. Même une vidéo par semaine fait une énorme différence.

Revenez maintenant et générez une nouvelle vidéo en 2 minutes.

Idée du jour : "Comment rester motivé même quand tout va mal"

👉 Reprenez votre momentum maintenant !

Cordialement,
L'équipe`
    }
  },

  newsletter(name: string, ideas: string[], hooks: string[], scriptPreview: string) {
    const ideasBlock = ideas.map((idea, i) => `${i + 1}. ${idea}`).join('\n')
    const hooksBlock = hooks.map((hook, i) => `${i + 1}. ${hook}`).join('\n')

    return {
      subject: '📬 Vos idées de contenu de la semaine — Faceless Motivation',
      text: `Bonjour ${name},

Voici votre dose hebdomadaire d'inspiration pour vos vidéos faceless motivation.

─── 3 IDÉES DE VIDÉOS ───────────────────────────────
${ideasBlock}

─── 5 HOOKS QUI ACCROCHENT ──────────────────────────
${hooksBlock}

─── APERÇU DE SCRIPT ────────────────────────────────
${scriptPreview}

─────────────────────────────────────────────────────

👉 Connectez-vous et générez l'une de ces vidéos maintenant !

Cordialement,
L'équipe`
    }
  }
}

export const sendEmail = async ({ to, subject, text, html }: EmailParams): Promise<any> => {
  const from = Bun.env.EMAIL_FROM || `${FROM_NAME} <${FROM_EMAIL}>`

  const mailOptions: any = {
    from,
    to,
    subject,
    ...(text && { text }),
    ...(html && { html })
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    return info
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}

export const sendVerificationEmail = ({ email, verificationUrl }: { email: string; verificationUrl: string }) => {
  const emailTemplate = emailTemplates.verification(verificationUrl)
  return sendEmail({ to: email, ...emailTemplate })
}

export const sendResetPasswordEmail = ({ email, verificationUrl }: { email: string; verificationUrl: string }) => {
  const emailTemplate = emailTemplates.resetPassword(verificationUrl)
  return sendEmail({ to: email, ...emailTemplate })
}

export const sendChangeEmailVerification = ({ email, verificationUrl }: { email: string; verificationUrl: string }) => {
  const emailTemplate = emailTemplates.changeEmail(verificationUrl)
  return sendEmail({ to: email, ...emailTemplate })
}

export const sendDeleteAccountVerification = ({
  email,
  verificationUrl
}: {
  email: string
  verificationUrl: string
}) => {
  const emailTemplate = emailTemplates.deleteAccount(verificationUrl)
  return sendEmail({ to: email, ...emailTemplate })
}
