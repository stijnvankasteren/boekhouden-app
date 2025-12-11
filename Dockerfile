FROM node:20

WORKDIR /app

# Build arguments uit docker-compose
ARG DB_USER
ARG DB_PASSWORD
ARG DB_NAME
ARG DB_HOST=boekhouding-db

# Deze ENV gebruikt npm / Prisma tijdens install
ENV DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:3306/${DB_NAME}"
ENV NODE_ENV=development

# 1) package-info + prisma-schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 2) dependencies
RUN npm install

# 3) rest van de code
COPY . .

EXPOSE 3000

# Geen build, alleen dev (zoals je nu al doet)
CMD ["npm", "run", "dev"]
