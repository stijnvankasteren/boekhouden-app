# ---------- BUILD STAGE ----------
FROM node:20 AS builder

WORKDIR /app

# 1) package-info + prisma-schema kopiëren (voor postinstall)
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 2) dependencies installeren (postinstall -> prisma generate werkt nu)
RUN npm install

# 3) rest van de app kopiëren
COPY . .

# Zorg dat de public-map bestaat (ook als die niet in de repo staat)
RUN mkdir -p public

ENV NODE_ENV=production
ENV DATABASE_URL="mysql://boekhouding:boekhouding-password@boekhouding-db:3306/boekhouding-db"

# 4) voor de zekerheid nog een prisma generate + build
RUN npx prisma generate
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="mysql://boekhouding:boekhouding-password@boekhouding-db:3306/boekhouding-db"

# OpenSSL voor Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m nextjs

# Copy build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Geef alles in /app aan user 'nextjs'
RUN chown -R nextjs:nextjs /app

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "npm run migrate:deploy && node server.js"]
