import process from 'node:process'
import * as nodemailer from 'nodemailer'

type EmailParams = {
  to: string
  subject: string
  text?: string
  html?: string
}

const FROM_NAME = process.env.APP_NAME || 'Sketch Pilot'
const FROM_EMAIL = process.env.EMAIL_FROM || 'contact@sketchpilot.com'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number.parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
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
      subject: `Confirmation de suppression de compte - ${FROM_NAME}`,
      text: `Bonjour,

Nous avons reçu une demande de suppression de votre compte ${FROM_NAME}.

Pour confirmer cette action, veuillez cliquer sur le lien suivant:
${verificationUrl}

Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer ce message et contacter notre support.

Ce lien expirera dans 24 heures.

Cordialement,
L'équipe ${FROM_NAME}`
    }
  },

  verification(verificationUrl: string) {
    return {
      subject: `Vérifiez votre adresse email - ${FROM_NAME}`,
      text: `Bonjour,

Merci de vous être inscrit à ${FROM_NAME}. Pour finaliser votre inscription, veuillez vérifier votre adresse email en cliquant sur le lien suivant:
${verificationUrl}

Ce lien expirera dans 24 heures.

Cordialement,
L'équipe ${FROM_NAME}`
    }
  },

  resetPassword(verificationUrl: string) {
    return {
      subject: `Réinitialisation de votre mot de passe - ${FROM_NAME}`,
      text: `Bonjour,

Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte ${FROM_NAME}.

Pour créer un nouveau mot de passe, veuillez cliquer sur le lien suivant:
${verificationUrl}

Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer ce message.

Ce lien expirera dans 24 heures.

Cordialement,
L'équipe ${FROM_NAME}`
    }
  },

  changeEmail(verificationUrl: string) {
    return {
      subject: `Vérification du changement d'email - ${FROM_NAME}`,
      text: `Bonjour,

Nous avons reçu une demande de changement d'adresse email pour votre compte ${FROM_NAME}.

Pour confirmer cette nouvelle adresse email, veuillez cliquer sur le lien suivant:
${verificationUrl}

Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer ce message et contacter notre support.

Ce lien expirera dans 24 heures.

Cordialement,
L'équipe ${FROM_NAME}`
    }
  },

  otpLogin(otpCode: string) {
    return {
      subject: `Votre code de connexion - ${FROM_NAME}`,
      text: `Bonjour,

Voici votre code de connexion à 4 chiffres pour ${FROM_NAME} :

    ${otpCode}

Ce code est valable pendant 10 minutes.

⚠️ Ne partagez jamais ce code avec quelqu'un d'autre. ${FROM_NAME} ne vous le demandera jamais par message.

Si vous n'avez pas demandé ce code, vous pouvez ignorer cet email.

Cordialement,
L'équipe ${FROM_NAME}`
    }
  },

  paymentSucceeded(name: string) {
    return {
      subject: `Paiement réussi pour votre abonnement ${FROM_NAME}`,
      text: `Bonjour ${name},

Nous vous informons que votre paiement a été traité avec succès. Vous avez maintenant accès à toutes les fonctionnalités de votre abonnement.

Nous vous remercions de votre confiance.

Cordialement,
L'équipe ${FROM_NAME}`
    }
  }
}

export const sendEmail = async ({ to, subject, text, html }: EmailParams): Promise<any> => {
  const from = process.env.EMAIL_FROM || `${FROM_NAME} <${FROM_EMAIL}>`

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
