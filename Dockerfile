FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["npm", "start"]
