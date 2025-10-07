# Use Node.js LTS version
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Copy app source code
COPY . .

# Set environment variable for production
ENV NODE_ENV=production

# Expose the port from your env file
EXPOSE 3000

# Start the application (adjust the entry point file if needed)
CMD ["node", "app.js"]