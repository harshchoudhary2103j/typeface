# Use Node.js LTS version with Python support for OCR
FROM node:20-alpine

# Install Python and pip for OCR dependencies
RUN apk add --no-cache python3 py3-pip

# Create app directory
WORKDIR /usr/src/app

# Install Python dependencies for OCR
RUN pip3 install pillow pytesseract requests

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy app source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads/receipts uploads/statements

# Set environment variable for production
ENV NODE_ENV=production

# Expose the port from env file
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the application
CMD ["node", "src/server.js"]
