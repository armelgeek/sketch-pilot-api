export const verificationCodeTemplate = (name: string, code: string) => ({
  subject: 'Code de vérification - Suppression de profil',
  text: `Bonjour ${name},

Nous avons reçu une demande de suppression de profil enfant sur votre compte Meko Academy.

Voici votre code de vérification :

${code}

Ce code est valable pendant 15 minutes.

Si vous n'avez pas demandé cette suppression, veuillez ignorer ce message et contacter notre support.

Cordialement,
L'équipe Meko Academy`
})
