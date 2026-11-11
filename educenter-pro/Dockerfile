FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY js ./js
COPY css ./css
COPY index.html student.html teacher.html ./
COPY scripts ./scripts
ENV EDUCENTER_MODE=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
