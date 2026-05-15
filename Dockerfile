FROM node:22-bullseye AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bullseye AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 3001

CMD ["npm", "run", "start:server"]
