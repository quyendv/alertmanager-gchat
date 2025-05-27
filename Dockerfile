FROM node:18-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodeuser -u 1001

COPY package*.json ./

RUN npm ci --only=production && \
  npm cache clean --force


COPY index.js ./

# Change ownership to non-root user
RUN chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 3000

CMD ["npm", "start"]