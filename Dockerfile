# ---------- BUILD STAGE ----------
FROM node:20 AS builder

WORKDIR /app

# Alleen package.json kopiëren, lockfile negeren (vermijdt veel dependency-ellende)
COPY package.json ./

# Installeer dependencies (minder streng dan npm ci)
RUN npm install --legacy-peer-deps

# Rest van de code
COPY . .

# Map voor SQLite DB
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/boekhouding.db"

# Prisma + build
RUN npx prisma generate
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/boekhouding.db"

# Gebruiker aanmaken
RUN useradd -m nextjs

# Nodige bestanden uit build-stage kopiëren
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Map voor DB + rechten
RUN mkdir -p /app/data && chown -R nextjs:nextjs /app

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Next.js standalone start meestal via server.js
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
