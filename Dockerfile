FROM node:25-alpine

WORKDIR /app

COPY certs/swroot-keyfactor.crt /root/swroot-keyfactor.crt
RUN cat /root/swroot-keyfactor.crt >> /etc/ssl/certs/ca-certificates.crt
RUN apk --no-cache add ca-certificates \
    && rm -rf /var/cache/apk/*
COPY certs/*.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates

COPY . .

RUN npm ci --only=production

EXPOSE 3001

CMD ["npm", "start"]

