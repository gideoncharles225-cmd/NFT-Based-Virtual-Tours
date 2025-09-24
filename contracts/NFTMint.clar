(define-non-fungible-token virtual-tour-nft uint)

(define-map nft-metadata
  { nft-id: uint }
  {
    creator: principal,
    tour-title: (string-ascii 100),
    description: (string-ascii 500),
    content-hash: (buff 32),
    access-tier: (string-ascii 20),
    mint-time: uint,
    edition-limit: uint,
    edition-count: uint,
    royalty-rate: uint,
    is-transferable: bool,
    metadata-uri: (optional (string-ascii 256)),
    tags: (list 10 (string-ascii 50))
  }
)

(define-map nft-owners
  { nft-id: uint }
  principal
)

(define-data-var last-nft-id uint u0)
(define-data-var contract-owner principal tx-sender)
(define-data-var mint-fee uint u1000)
(define-data-var max-edition-limit uint u100)
(define-data-var paused bool false)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-HASH (err u101))
(define-constant ERR-INVALID-TIER (err u102))
(define-constant ERR-INVALID-TITLE (err u103))
(define-constant ERR-INVALID-DESCRIPTION (err u104))
(define-constant ERR-INVALID-EDITION-LIMIT (err u105))
(define-constant ERR-EDITION-LIMIT-REACHED (err u106))
(define-constant ERR-INVALID-ROYALTY-RATE (err u107))
(define-constant ERR-PAUSED (err u108))
(define-constant ERR-INVALID-METADATA-URI (err u109))
(define-constant ERR-INVALID-TAGS (err u110))
(define-constant ERR-NFT-NOT-FOUND (err u111))
(define-constant ERR-NOT-OWNER (err u112))
(define-constant ERR-TRANSFER-NOT-ALLOWED (err u113))
(define-constant ERR-INVALID-FEE (err u114))
(define-constant ERR-INSUFFICIENT-BALANCE (err u115))

(define-private (validate-title (title (string-ascii 100)))
  (if (and (> (len title) u0) (<= (len title) u100))
    (ok true)
    ERR-INVALID-TITLE
  )
)

(define-private (validate-description (desc (string-ascii 500)))
  (if (<= (len desc) u500)
    (ok true)
    ERR-INVALID-DESCRIPTION
  )
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
    (ok true)
    ERR-INVALID-HASH
  )
)

(define-private (validate-tier (tier (string-ascii 20)))
  (if (or (is-eq tier "basic") (is-eq tier "premium") (is-eq tier "exclusive"))
    (ok true)
    ERR-INVALID-TIER
  )
)

(define-private (validate-edition-limit (limit uint))
  (if (and (> limit u0) (<= limit (var-get max-edition-limit)))
    (ok true)
    ERR-INVALID-EDITION-LIMIT
  )
)

(define-private (validate-royalty-rate (rate uint))
  (if (<= rate u20)
    (ok true)
    ERR-INVALID-ROYALTY-RATE
  )
)

(define-private (validate-metadata-uri (uri (optional (string-ascii 256))))
  (match uri
    u (if (<= (len u) u256) (ok true) ERR-INVALID-METADATA-URI)
    (ok true)
  )
)

(define-private (validate-tags (tags (list 10 (string-ascii 50))))
  (if (<= (len tags) u10)
    (ok true)
    ERR-INVALID-TAGS
  )
)

(define-public (set-paused (new-paused bool))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set paused new-paused)
    (ok true)
  )
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (> new-fee u0) ERR-INVALID-FEE)
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (set-max-edition-limit (new-limit uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (> new-limit u0) ERR-INVALID-EDITION-LIMIT)
    (var-set max-edition-limit new-limit)
    (ok true)
  )
)

(define-public (mint-nft
  (tour-title (string-ascii 100))
  (description (string-ascii 500))
  (content-hash (buff 32))
  (access-tier (string-ascii 20))
  (edition-limit uint)
  (royalty-rate uint)
  (is-transferable bool)
  (metadata-uri (optional (string-ascii 256)))
  (tags (list 10 (string-ascii 50)))
)
  (let
    (
      (nft-id (+ (var-get last-nft-id) u1))
      (creator tx-sender)
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (try! (contract-call? .RegistryContract is-registered-institution creator))
    (try! (validate-title tour-title))
    (try! (validate-description description))
    (try! (validate-hash content-hash))
    (try! (validate-tier access-tier))
    (try! (validate-edition-limit edition-limit))
    (try! (validate-royalty-rate royalty-rate))
    (try! (validate-metadata-uri metadata-uri))
    (try! (validate-tags tags))
    (try! (stx-transfer? (var-get mint-fee) tx-sender (var-get contract-owner)))
    (try! (nft-mint? virtual-tour-nft nft-id creator))
    (map-set nft-metadata
      { nft-id: nft-id }
      {
        creator: creator,
        tour-title: tour-title,
        description: description,
        content-hash: content-hash,
        access-tier: access-tier,
        mint-time: block-height,
        edition-limit: edition-limit,
        edition-count: u1,
        royalty-rate: royalty-rate,
        is-transferable: is-transferable,
        metadata-uri: metadata-uri,
        tags: tags
      }
    )
    (map-set nft-owners { nft-id: nft-id } creator)
    (var-set last-nft-id nft-id)
    (print { event: "nft-minted", id: nft-id, creator: creator })
    (ok nft-id)
  )
)

(define-public (transfer-nft (nft-id uint) (recipient principal))
  (let
    (
      (metadata (unwrap! (map-get? nft-metadata { nft-id: nft-id }) ERR-NFT-NOT-FOUND))
      (current-owner (unwrap! (map-get? nft-owners { nft-id: nft-id }) ERR-NFT-NOT-FOUND))
    )
    (asserts! (is-eq tx-sender current-owner) ERR-NOT-OWNER)
    (asserts! (get is-transferable metadata) ERR-TRANSFER-NOT-ALLOWED)
    (try! (nft-transfer? virtual-tour-nft nft-id tx-sender recipient))
    (map-set nft-owners { nft-id: nft-id } recipient)
    (print { event: "nft-transferred", id: nft-id, from: tx-sender, to: recipient })
    (ok true)
  )
)

(define-read-only (get-nft-details (nft-id uint))
  (map-get? nft-metadata { nft-id: nft-id })
)

(define-read-only (get-nft-owner (nft-id uint))
  (map-get? nft-owners { nft-id: nft-id })
)

(define-read-only (get-last-nft-id)
  (ok (var-get last-nft-id))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)

(define-read-only (get-mint-fee)
  (ok (var-get mint-fee))
)