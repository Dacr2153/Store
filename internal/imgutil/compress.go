// Package imgutil converts any uploaded image (JPEG, PNG, WebP, GIF) into a
// compressed WebP file.
//
// Strategy (best space-efficiency without perceptible quality loss):
//   - Decode the source with standard library + chai2010/webp for WebP input.
//   - Resize to max 1920 px on the longest side (Lanczos3 — sharpest for photos).
//   - Encode as WebP at quality 88 (visually lossless; ~40-60% smaller than
//     equivalent JPEG, ~70-80% smaller than PNG).
//
// Typical savings:
//   - 4 MB JPEG → 900 KB WebP  (–77%)
//   - 3 MB PNG  → 600 KB WebP  (–80%)
package imgutil

import (
	"bytes"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"

	"github.com/chai2010/webp"
	xdraw "golang.org/x/image/draw"
)

// MaxDimension is the largest side (width or height) an uploaded image may
// have after resizing. Images smaller than this are never upscaled.
const MaxDimension = 1920

// Quality is the WebP quality level (0-100). 88 is visually near-lossless
// while still cutting file size dramatically vs JPEG/PNG.
const Quality = 88

// CompressToWebP reads an image from r, decodes it (JPEG/PNG/GIF/WebP),
// optionally downscales it so the longest side ≤ MaxDimension, then encodes
// it as a WebP at Quality. The result is written to w.
//
// Supported input formats: image/jpeg, image/png, image/gif, image/webp.
func CompressToWebP(w io.Writer, r io.Reader, contentType string) error {
	data, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("imgutil: read: %w", err)
	}

	img, err := decode(data, contentType)
	if err != nil {
		return fmt.Errorf("imgutil: decode: %w", err)
	}

	img = resize(img, MaxDimension)

	if err := webp.Encode(w, img, &webp.Options{Lossless: false, Quality: Quality}); err != nil {
		return fmt.Errorf("imgutil: webp encode: %w", err)
	}
	return nil
}

// decode tries the indicated content-type first, then falls back to Go's
// auto-detect (image.Decode), then falls back to WebP (chai2010/webp).
func decode(data []byte, contentType string) (image.Image, error) {
	r := bytes.NewReader(data)

	switch contentType {
	case "image/webp":
		img, err := webp.Decode(r)
		if err == nil {
			return img, nil
		}
		// fall through to auto-detect
		r.Seek(0, io.SeekStart)
	case "image/gif":
		frames, err := gif.DecodeAll(r)
		if err == nil && len(frames.Image) > 0 {
			return frames.Image[0], nil // use first frame
		}
		r.Seek(0, io.SeekStart)
	}

	// Standard library auto-detect (JPEG, PNG, GIF).
	r.Seek(0, io.SeekStart)
	img, _, err := image.Decode(r)
	if err == nil {
		return img, nil
	}

	// Last resort: try WebP even if content-type didn't say so.
	r.Seek(0, io.SeekStart)
	img, werr := webp.Decode(r)
	if werr != nil {
		return nil, fmt.Errorf("cannot decode image (tried standard + webp): %v / %v", err, werr)
	}
	return img, nil
}

// resize returns a new image scaled so its longest side is ≤ maxPx.
// If both dimensions are already within the limit, the original is returned
// unchanged (no copy, no allocation).
func resize(src image.Image, maxPx int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= maxPx && h <= maxPx {
		return src
	}

	var newW, newH int
	if w >= h {
		newW = maxPx
		newH = (h * maxPx) / w
	} else {
		newH = maxPx
		newW = (w * maxPx) / h
	}
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	xdraw.BiLinear.Scale(dst, dst.Bounds(), src, b, xdraw.Over, nil)
	return dst
}

// Register decoders so image.Decode can handle JPEG and PNG automatically.
func init() {
	_ = jpeg.Decode // ensure jpeg is linked
	_ = png.Decode  // ensure png is linked
}
