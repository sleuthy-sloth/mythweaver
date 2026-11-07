# Maps

One image per campaign, with markers you place by tapping.

## The image

- **PNG or JPEG**, up to **2 MB**. The format is decided by reading the bytes, not by trusting the
  filename or the `Content-Type` the client sent: a sentence renamed `map.png` is rejected.
- Stored in Postgres (`bytea`), so a database backup contains the maps too. No object store, no
  extra volume to forget.
- Served from `/api/v1/campaigns/:id/map/image` **behind the same membership check as everything
  else** — not from a public directory. Responses are `private` and tagged with the map revision, so
  a replaced map is not served stale.
- Replacing the image keeps the row and bumps `revision`; deleting it removes its markers with it,
  because a marker without a map is a coordinate with nothing to be on.

## Markers

`x` and `y` are **normalized 0..1**, measured from the top-left of the image. That is the whole
trick behind the feature working on a phone and a desktop: the marker is stored as a fraction of the
image, so it lands in the same place at 390 px or 1400 px wide. The database also rejects values
outside 0..1.

A marker has a label and an optional link to a place from the world (`locations`). The link is a real
foreign key with `on delete set null`: deleting the place leaves the pin where it is, labelled.

## Attribution

Every map carries an `attribution` string. It is empty for something you drew; it exists so that a
tile source or a borrowed map has somewhere to state its licence before anyone ships one. **No map
tiles are downloaded or bundled** — the app never fetches an image it was not given.

## In exports

Maps are in the export as of **format version 2**, base64 inside the JSON:

```json
"map": {
  "name": "The Reach",
  "mimeType": "image/png",
  "width": 900, "height": 600,
  "attribution": null,
  "dataBase64": "iVBORw0KGgo…",
  "markers": [ { "id", "x", "y", "label", "locationId" } ]
}
```

Base64 costs a third in size but keeps the export a single document with a single checksum and a
single validation path — no zip parser on the server, no path traversal to reason about. The import
cap is 5 MB, which is why the per-image cap is 2 MB. Version 1 files still import; they simply have
no map.

## Limits

- One map per campaign (a unique index enforces it). Several regional maps would mean dropping that
  index, not rewriting the reads.
- No zoom or pan: the image scales to the width of the card.
- Marker positions are not draggable after placement; delete and tap again.
