# ComplianceOS LaTeX renderer — xelatex + Arabic (Amiri) + a tiny Node server.
#
# Image size is a few hundred MB (the TeX packages dominate). That's fine for
# Cloud Run / Render; it does NOT need to fit Vercel's function bundle (the whole
# point of running LaTeX out-of-band). If a future template needs a .sty that
# isn't bundled, add the relevant texlive-* package below (or fall back to
# `texlive-full`).

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-xetex \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-lang-arabic \
      texlive-fonts-recommended \
      fonts-hosny-amiri \
      fontconfig \
      nodejs \
      npm \
      ca-certificates \
 && fc-cache -fv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
