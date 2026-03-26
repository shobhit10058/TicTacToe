FROM heroiclabs/nakama-pluginbuilder:3.22.0 AS go-builder

ENV GO111MODULE=on
ENV CGO_ENABLED=1
WORKDIR /backend

COPY server/ ./
RUN go mod tidy && go build --trimpath -buildmode=plugin -o ./backend.so .

FROM heroiclabs/nakama:3.22.0

COPY --from=go-builder /backend/backend.so /nakama/data/modules/
COPY nakama/local.yml /nakama/data/modules/local.yml
