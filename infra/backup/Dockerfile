# postgres:16-alpine already ships pg_dump at the matching server version — the whole
# point of this image is to add the one other tool we need (mc, for the optional
# off-site mirror) on top of that.
FROM postgres:16-alpine

RUN apk add --no-cache curl bash tzdata \
  && curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc \
  && chmod +x /usr/local/bin/mc

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

ENTRYPOINT ["/usr/local/bin/backup.sh"]
