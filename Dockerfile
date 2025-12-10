# ---------- BUILD STAGE ----------
FROM node:20 AS builder

WORKDIR /app

# 1) package-info + prisma-schema kopiëren (voor postinstall)
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Zet build-omgeving EN DATABASE_URL vóór npm install,
# zodat de Prisma postinstall ('prisma generate') niet stukloopt
ENV NODE_ENV=production
ENV DATABASE_URL="mysql://boekhouding:boekhouding-password@boekhouding-db:3306/boekhouding-db"

# 2) dependencies installeren
RUN npm install

# 3) rest van de app kopiëren
COPY . .

# Zorg dat de public-map bestaat (ook als die niet in de repo staat)
RUN mkdir -p public

# 4) voor de zekerheid nog een prisma generate + build
RUN npx prisma generate
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="mysql://boekhouding:boekhouding-password@boekhouding-db:3306/boekhouding-db"

# Next.js standalone output kopiëren
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Prisma client + node_modules
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Niet-root user
RUN useradd -m nextjs && chown -R nextjs:nextjs /app
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
