FROM golang:1.21-alpine

WORKDIR /app

COPY go.mod ./
COPY go.sum ./

COPY *.go ./

RUN go mod tidy && go build -o /exporter

EXPOSE 8080

CMD [ "/exporter" ]