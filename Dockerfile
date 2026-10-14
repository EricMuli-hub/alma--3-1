FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
COPY alma ./alma
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data WEB_DIR=/app/alma
RUN useradd -m alma && mkdir /data && chown alma /data
USER alma
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/server
CMD ["node", "src/index.js"]
