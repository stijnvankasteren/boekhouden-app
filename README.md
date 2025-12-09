# Boekhouding App voor BV Holding

Een moderne, productie-klare boekhoudapplicatie voor Nederlandse BV-holdings, gebouwd met Next.js 14, TypeScript, Prisma en SQLite.

## Functies

- **Dashboard**: Overzicht van totale omzet, kosten en resultaat met recente transacties
- **Bedrijfsinstellingen**: Beheer bedrijfsgegevens, KvK-nummer, BTW-ID, IBAN, etc.
- **Relatiebeheer**: Beheer klanten en leveranciers
- **Transacties**: Registreer inkomsten en uitgaven met automatische BTW-berekening
- **Winst & Verlies**: Overzicht per categorie
- **BTW-rapport**: Kwartaaloverzicht voor BTW-aangifte

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite met Prisma ORM
- **Deployment**: Docker & Docker Compose

## Vereisten

- Node.js 20 of hoger
- npm of yarn
- Docker en Docker Compose (voor productie-deployment)

## Lokale Ontwikkeling

### 1. Installeer dependencies

```bash
npm install
```

### 2. Initialiseer de database

De database wordt automatisch aangemaakt bij de eerste start. De SQLite database bestand wordt opgeslagen in de `data` folder.

```bash
npx prisma migrate deploy
npx prisma generate
```

### 3. Start de development server

```bash
npm run dev
```

De applicatie is nu beschikbaar op [http://localhost:3000](http://localhost:3000).

## Docker Deployment

### Optie 1: Met Docker Compose (aanbevolen)

Dit is de eenvoudigste manier om de applicatie in productie te draaien.

#### 1. Build en start de container

```bash
docker-compose up -d
```

Dit commando:
- Bouwt de Docker image
- Start de container op poort 3000
- Maakt een volume mount voor de database (./data)
- Herstart de container automatisch bij crashes of server reboots

#### 2. Bekijk logs

```bash
docker-compose logs -f
```

#### 3. Stop de applicatie

```bash
docker-compose down
```

#### 4. Database backup

De SQLite database staat in de `./data` folder op de host. Maak regelmatig een backup:

```bash
cp ./data/boekhouding.db ./data/boekhouding.db.backup
```

### Optie 2: Alleen Docker (zonder Compose)

#### 1. Build de image

```bash
docker build -t boekhouding-app .
```

#### 2. Start de container

```bash
docker run -d \
  --name boekhouding \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  boekhouding-app
```

## Portainer Deployment

Als je Portainer gebruikt om Docker containers te beheren:

### 1. Via Portainer UI

1. Ga naar **Stacks** in Portainer
2. Klik op **Add stack**
3. Geef de stack een naam (bijv. `boekhouding`)
4. Plak de inhoud van `docker-compose.yml` in de editor
5. Klik op **Deploy the stack**

### 2. Via Git Repository

1. Ga naar **Stacks** in Portainer
2. Klik op **Add stack**
3. Selecteer **Git Repository**
4. Voer de repository URL in
5. Specificeer `docker-compose.yml` als Compose path
6. Klik op **Deploy the stack**

## Database Configuratie

De applicatie gebruikt SQLite als database. De database configuratie wordt beheerd via de `DATABASE_URL` environment variable in het `.env` bestand:

```
DATABASE_URL="file:./data/boekhouding.db"
```

Voor Docker deployments wordt dit automatisch ingesteld naar:

```
DATABASE_URL="file:/app/data/boekhouding.db"
```

## Poort Configuratie

De applicatie draait standaard op **poort 3000**. Als je een andere poort wilt gebruiken:

### Voor Docker Compose

Wijzig in `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # Host poort : Container poort
```

### Voor Docker

Gebruik de `-p` flag:

```bash
docker run -p 8080:3000 boekhouding-app
```

## Database Migraties

Bij het starten van de Docker container worden database migraties automatisch uitgevoerd via:

```bash
npx prisma migrate deploy
```

Dit zorgt ervoor dat het database schema altijd up-to-date is.

## Productie Best Practices

### 1. Regelmatige Backups

Maak regelmatig backups van de database:

```bash
# Handmatige backup
cp ./data/boekhouding.db ./backups/boekhouding-$(date +%Y%m%d).db

# Of automatiseer met een cron job
0 2 * * * cp /path/to/data/boekhouding.db /path/to/backups/boekhouding-$(date +\%Y\%m\%d).db
```

### 2. Reverse Proxy

Voor productie gebruik, zet een reverse proxy (zoals Nginx of Traefik) voor de applicatie:

```nginx
server {
    listen 80;
    server_name boekhouding.jouwdomein.nl;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. HTTPS/SSL

Voor een veilige verbinding, configureer SSL met Let's Encrypt of een andere SSL provider.

### 4. Resource Limits

Beperk resource gebruik in Docker Compose:

```yaml
services:
  boekhouding:
    # ... andere configuratie
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## Troubleshooting

### Database locked error

Als je een "database is locked" error krijgt:

1. Stop de container: `docker-compose down`
2. Verwijder het lock bestand: `rm ./data/boekhouding.db-journal`
3. Start de container opnieuw: `docker-compose up -d`

### Poort al in gebruik

Als poort 3000 al in gebruik is:

```bash
# Vind het process dat de poort gebruikt
lsof -i :3000

# Of wijzig de poort in docker-compose.yml
```

### Database reset

Als je de database wilt resetten:

```bash
# Stop de container
docker-compose down

# Verwijder de database
rm -rf ./data/boekhouding.db*

# Start opnieuw (nieuwe database wordt aangemaakt)
docker-compose up -d
```

## Ontwikkeling

### Project Structuur

```
boekhouding-app/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── instellingen/      # Settings page
│   ├── relaties/          # Relations pages
│   ├── transacties/       # Transactions pages
│   ├── winst-verlies/     # Profit & Loss page
│   ├── btw-rapport/       # VAT report page
│   └── page.tsx           # Dashboard
├── components/            # Reusable components
├── lib/                   # Utility functions
├── prisma/               # Database schema & migrations
├── public/               # Static assets
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose configuration
└── package.json          # Dependencies
```

### Database Schema

De database bevat drie hoofdtabellen:

- **CompanySettings**: Bedrijfsinstellingen
- **Relation**: Klanten en leveranciers
- **Transaction**: Inkomsten en uitgaven met BTW

### Prisma Commands

```bash
# Genereer Prisma Client
npx prisma generate

# Voer migraties uit
npx prisma migrate deploy

# Open Prisma Studio (database GUI)
npx prisma studio

# Maak een nieuwe migratie
npx prisma migrate dev --name beschrijving
```

### Build voor Productie

```bash
npm run build
npm start
```

## Support & Bijdragen

Voor vragen, problemen of feature requests, maak een issue aan in de repository.

## Licentie

Dit project is gebouwd voor intern gebruik binnen BV-holdings.
