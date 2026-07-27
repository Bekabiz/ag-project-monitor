#!/usr/bin/env python3
"""
AG Project Monitor — app icon generator.

White ground, bold black "AG". Deliberately plain: at 60px on a lock screen
nothing else survives, and the office is an engineering practice, not a
consumer app.

Liberation Sans Bold is used as the closest available neutral grotesque to the
app's Inter. Letters are tracked slightly tight, which is what stops bold caps
looking loose at small sizes.

Outputs:
  icon-192.png            any-purpose, full bleed
  icon-512.png            any-purpose, full bleed
  icon-maskable-512.png   80% safe zone for Android adaptive masks
  apple-touch-icon.png    180px, iOS
  favicon.svg             vector, browser tab
"""

from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
WHITE = (255, 255, 255)
INK = (29, 29, 31)          # #1d1d1f — matches the app's --ink
TEXT = "AG"
TRACKING = -0.035            # negative letter-spacing, as a fraction of size


def draw_icon(px, safe=1.0, cap_ratio=0.42):
    """cap_ratio: cap height as a fraction of the icon width."""
    img = Image.new("RGB", (px, px), WHITE)
    d = ImageDraw.Draw(img)

    target_cap = px * cap_ratio * safe

    # Binary-search the point size that yields the target cap height.
    lo, hi = 10, px * 2
    font = ImageFont.truetype(FONT, lo)
    for _ in range(40):
        mid = (lo + hi) // 2
        font = ImageFont.truetype(FONT, mid)
        cap = d.textbbox((0, 0), "A", font=font)[3] - d.textbbox((0, 0), "A", font=font)[1]
        if cap < target_cap:
            lo = mid + 1
        else:
            hi = mid - 1
    size = lo
    font = ImageFont.truetype(FONT, size)

    track = size * TRACKING

    # Measure the tracked string so it can be centred precisely.
    widths = [d.textbbox((0, 0), ch, font=font)[2] - d.textbbox((0, 0), ch, font=font)[0]
              for ch in TEXT]
    total_w = sum(widths) + track * (len(TEXT) - 1)

    bbox = d.textbbox((0, 0), TEXT, font=font)
    cap_h = bbox[3] - bbox[1]

    x = (px - total_w) / 2
    y = (px - cap_h) / 2 - bbox[1]

    for ch, w in zip(TEXT, widths):
        chb = d.textbbox((0, 0), ch, font=font)
        d.text((x - chb[0], y), ch, font=font, fill=INK)
        x += w + track

    return img


def main():
    draw_icon(192).save("public/icon-192.png")
    draw_icon(512).save("public/icon-512.png")
    # Maskable: Android crops to a circle inscribed in the square, so keep the
    # mark well inside the safe zone.
    draw_icon(512, safe=0.72).save("public/icon-maskable-512.png")
    draw_icon(180).save("public/apple-touch-icon.png")

    with open("public/favicon.svg", "w") as f:
        f.write(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            '<rect width="512" height="512" fill="#ffffff"/>'
            '<text x="256" y="256" fill="#1d1d1f" font-family="Inter, Helvetica, Arial, sans-serif" '
            'font-size="215" font-weight="700" letter-spacing="-7.5" '
            'text-anchor="middle" dominant-baseline="central">AG</text>'
            "</svg>\n"
        )

    print("written: icon-192, icon-512, icon-maskable-512, apple-touch-icon, favicon.svg")


if __name__ == "__main__":
    main()
