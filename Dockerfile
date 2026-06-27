FROM rust:1.78-slim AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./

RUN mkdir src && echo "fn main() {}" > src/main.rs

RUN cargo build --release

COPY src ./src

RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim AS runtime

WORKDIR /app

COPY --from=builder /app/target/release/photoGallery .

COPY static ./static

EXPOSE 3000

CMD ["./photoGallery"]

