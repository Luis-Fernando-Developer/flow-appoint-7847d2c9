# Dockerfile para o Frontend (Vite + React)
FROM node:20-alpine as build

WORKDIR /app

COPY package.json bun.lockb* ./
RUN npm install -g bun
RUN bun install

COPY . .

# Variáveis de ambiente para o build do Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN bun run build

# Estágio de produção com Nginx
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
