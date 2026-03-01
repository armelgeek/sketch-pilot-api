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

const SUBSCRIPTION_ACTION_URL = Bun.env.SUBSCRIPTION_ACTION_URL || 'https://dev.meko.ac/subscription'

export const emailTemplates = {
  trialStarted(name: string) {
    return {
      subject: '🎉 Bienvenue chez Meko Academy - Votre essai gratuit a commencé !',
      text: `Bonjour ${name},

Nous sommes ravis de vous accueillir chez Meko Academy ! 

Votre période d'essai gratuit vient de débuter et vous avez maintenant accès à l'intégralité de notre plateforme éducative premium. C'est l'occasion parfaite pour découvrir comment nous pouvons transformer l'apprentissage de vos enfants.

🔹 Explorez nos modules interactifs
🔹 Testez nos fonctionnalités avancées
🔹 Découvrez notre approche pédagogique innovante

À la fin de votre période d'essai, votre abonnement se poursuivra automatiquement pour que vos enfants puissent continuer leur apprentissage sans interruption.

Votre tableau de bord vous attend : ${SUBSCRIPTION_ACTION_URL}

Notre équipe support reste disponible pour vous accompagner dans cette découverte. N'hésitez pas à nous faire part de vos impressions !

Excellente exploration,
L'équipe Meko Academy`
    }
  },

  trialEnding(name: string, daysLeft: number) {
    return {
      subject: `⏰ Plus que ${daysLeft} jour${daysLeft > 1 ? 's' : ''} d'essai gratuit restant`,
      text: `Bonjour ${name},

Nous espérons que vous appréciez votre expérience avec Meko Academy ! 

Votre période d'essai gratuit se termine dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}. Bonne nouvelle : votre abonnement se poursuivra automatiquement pour que vos enfants continuent leur parcours d'apprentissage sans interruption.

✨ Ce qui vous attend après l'essai :
• Accès continu à tous nos modules ludiques
• Suivi personnalisé des progrès sans limite
• Nouvelles fonctionnalités et contenus réguliers

Vous pouvez à tout moment modifier vos préférences d'abonnement ou annuler si vous le souhaitez.

👉 Gérer mon abonnement : ${SUBSCRIPTION_ACTION_URL}

Questions ? Notre équipe est là pour vous accompagner et vous conseiller.

À très bientôt,
L'équipe Meko Academy`
    }
  },

  trialLastDay(name: string) {
    return {
      subject: "✨ Dernier jour d'essai - Votre abonnement démarre demain !",
      text: `Bonjour ${name},

C'est votre dernier jour d'essai gratuit avec Meko Academy !

Nous espérons sincèrement que cette période vous a permis de découvrir la valeur de notre plateforme pour l'éducation de vos enfants. 

🎯 À partir de demain : Votre abonnement démarrera automatiquement pour assurer une continuité parfaite dans l'apprentissage de vos enfants. Toutes vos données et progrès seront bien sûr préservés.

Si vous souhaitez annuler votre abonnement avant qu'il ne commence, vous pouvez le faire dès maintenant :

👉 Gérer mon abonnement : ${SUBSCRIPTION_ACTION_URL}

Notre équipe reste disponible pour répondre à toutes vos questions.

Merci de nous faire confiance,
L'équipe Meko Academy`
    }
  },

  trialEnded(name: string) {
    return {
      subject: '🚀 Votre abonnement Meko Academy est maintenant actif !',
      text: `Bonjour ${name},

Votre période d'essai gratuit s'est achevée et votre abonnement Meko Academy est maintenant actif !

🌟 Continuez l'aventure :
• Tous vos progrès ont été préservés
• Accès illimité à l'ensemble de nos contenus
• Nouvelles fonctionnalités et modules à découvrir
• Support dédié pour vous accompagner

Votre premier paiement sera traité selon les conditions de votre abonnement. Vous conservez bien sûr la possibilité de modifier ou annuler votre abonnement à tout moment.

👉 Mon espace abonnement : ${SUBSCRIPTION_ACTION_URL}

Des questions ? Notre équipe est là pour vous accompagner dans cette nouvelle étape.

Bienvenue dans la communauté Meko Academy !
L'équipe Meko Academy`
    }
  },

  subscriptionCreated(name: string, planName: string) {
    return {
      subject: 'Bienvenue dans votre abonnement Meko Academy',
      text: `Bonjour ${name},

Merci d'avoir souscrit à notre formule ${planName}. Votre abonnement est maintenant actif.

Vous avez désormais accès à l'ensemble des fonctionnalités incluses dans votre abonnement.

Pour gérer votre abonnement: ${SUBSCRIPTION_ACTION_URL}

Nous restons à votre disposition pour toute question.

Cordialement,
L'équipe Meko Academy`
    }
  },

  subscriptionCancelled(name: string) {
    return {
      subject: 'Annulation de votre abonnement Meko Academy',
      text: `Bonjour ${name},

Nous confirmons l'annulation de votre abonnement Meko Academy.

Vous continuerez à bénéficier de votre accès jusqu'à la fin de la période de facturation en cours.

Si vous changez d'avis, vous pouvez réactiver votre abonnement à tout moment: ${SUBSCRIPTION_ACTION_URL}

Nous espérons vous revoir bientôt.

Cordialement,
L'équipe Meko Academy`
    }
  },

  paymentFailed(name: string) {
    return {
      subject: 'Échec du paiement de votre abonnement',
      text: `Bonjour ${name},

Nous n'avons pas pu traiter le paiement pour votre abonnement Meko Academy.

Veuillez vérifier vos informations de paiement pour éviter toute interruption de service.

Pour mettre à jour vos informations de paiement: ${SUBSCRIPTION_ACTION_URL}/payment

Si vous avez besoin d'aide, n'hésitez pas à nous contacter.

Cordialement,
L'équipe Meko Academy`
    }
  },

  paymentRetry(name: string, retryDate: Date) {
    const formattedDate = retryDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    return {
      subject: 'Nouvelle tentative de paiement prévue',
      text: `Bonjour ${name},

Suite à l'échec de traitement de votre paiement, une nouvelle tentative sera effectuée le ${formattedDate}.

Pour éviter tout problème, veuillez vérifier vos informations de paiement.

Pour mettre à jour vos informations de paiement: ${SUBSCRIPTION_ACTION_URL}/payment

Nous restons à votre disposition pour toute question.

Cordialement,
L'équipe Meko Academy`
    }
  },

  subscriptionExpired(name: string) {
    return {
      subject: 'Votre abonnement a expiré',
      text: `Bonjour ${name},

Votre abonnement Meko Academy a expiré et votre accès aux fonctionnalités premium a été suspendu.

Pour reprendre votre abonnement et retrouver l'accès à nos services:
${SUBSCRIPTION_ACTION_URL}

Nous espérons vous revoir bientôt.

Cordialement,
L'équipe Meko Academy`
    }
  },

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
  return sendEmail({
    to: email,
    ...emailTemplate
  })
}

export const sendResetPasswordEmail = ({ email, verificationUrl }: { email: string; verificationUrl: string }) => {
  const emailTemplate = emailTemplates.resetPassword(verificationUrl)
  return sendEmail({
    to: email,
    ...emailTemplate
  })
}

export const sendChangeEmailVerification = ({ email, verificationUrl }: { email: string; verificationUrl: string }) => {
  const emailTemplate = emailTemplates.changeEmail(verificationUrl)
  return sendEmail({
    to: email,
    ...emailTemplate
  })
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
