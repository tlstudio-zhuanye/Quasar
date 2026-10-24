"""生成 Quasar 的应用图标（build/icon.ico / build/icon.png）
不依赖外部素材，纯绘制：红色圆角底 + 白色唱片/音符。
"""
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build')
S = 1024  # 先在大画布上画，再缩小做抗锯齿


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 1) 圆角底 + 竖向渐变（用逐行填充 + 圆角遮罩）
    grad = Image.new('RGBA', (S, S))
    gd = ImageDraw.Draw(grad)
    top, bot = (236, 65, 65), (170, 26, 46)  # #ec4141 -> 深红
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(top, bot, y / (S - 1)))

    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    img.paste(grad, (0, 0), mask)

    # 2) 白色唱片圆环
    cx, cy = S * 0.5, S * 0.5
    r_out = S * 0.30
    d.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], outline=(255, 255, 255, 235),
              width=int(S * 0.035))
    r_groove = S * 0.225
    d.ellipse([cx - r_groove, cy - r_groove, cx + r_groove, cy + r_groove],
              outline=(255, 255, 255, 90), width=int(S * 0.012))

    # 3) 中心音符：符头 + 符干 + 符尾
    note = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    nd = ImageDraw.Draw(note)
    head_r = S * 0.072
    hx, hy = cx - S * 0.045, cy + S * 0.085
    nd.ellipse([hx - head_r, hy - head_r * 0.82, hx + head_r, hy + head_r * 0.82], fill=(255, 255, 255, 255))
    stem_w = int(S * 0.030)
    sx = hx + head_r - stem_w * 0.62
    nd.rectangle([sx, cy - S * 0.175, sx + stem_w, hy], fill=(255, 255, 255, 255))
    # 符尾（一条弧线感的粗旗）
    nd.polygon([
        (sx + stem_w, cy - S * 0.175),
        (sx + stem_w + S * 0.105, cy - S * 0.135),
        (sx + stem_w + S * 0.088, cy - S * 0.085),
        (sx + stem_w, cy - S * 0.108),
    ], fill=(255, 255, 255, 255))
    img.alpha_composite(note)

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    icon = make_icon()
    png = os.path.join(OUT_DIR, 'icon.png')
    icon.resize((512, 512), Image.LANCZOS).save(png)
    ico = os.path.join(OUT_DIR, 'icon.ico')
    icon.save(ico, format='ICO',
              sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print('已生成:', png)
    print('已生成:', ico)


if __name__ == '__main__':
    main()
