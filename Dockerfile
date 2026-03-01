# Base en utilisant bun:1.2.8
FROM oven/bun:1.2.8-alpine
WORKDIR /usr/src/app

# Copie des fichiers pour l'installation
COPY package.json ./

# Installation des dépendances
RUN bun install && rm -rf node_modules/better-auth/node_modules/zod

# Copie le reste des fichiers
COPY . .
#RUN cp .env.local .env

RUN mkdir -p /usr/src/app/uploads/avatars &&  chmod -R 755 /usr/src/app/uploads

# Expose le port de l'app
EXPOSE 3000

# Demarrer l'app en mode prod avec migration
CMD ["sh", "-c", "bun run db:push && bun run build && bun run prod"]

