import argparse
import cv2
import numpy as np


def parse_bool(value: str) -> bool:
    return str(value).lower() in {'1', 'true', 'yes', 'y'}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--contrast', type=float, default=1.0)
    parser.add_argument('--saturation', type=float, default=1.0)
    parser.add_argument('--gamma', type=float, default=1.0)
    parser.add_argument('--sharpen', default='false')
    parser.add_argument('--denoise', default='false')
    parser.add_argument('--sharpen_amount', type=float, default=0.0)
    parser.add_argument('--denoise_h', type=float, default=0.0)
    args = parser.parse_args()

    image = cv2.imread(args.input, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError('Unable to read input image')

    out = image.copy()

    denoise_h = float(args.denoise_h)
    if parse_bool(args.denoise) and denoise_h <= 0:
      denoise_h = 6.0
    if denoise_h > 0:
      out = cv2.fastNlMeansDenoisingColored(out, None, denoise_h, denoise_h, 7, 21)

    sharpen_amount = float(args.sharpen_amount)
    if parse_bool(args.sharpen) and sharpen_amount <= 0:
      sharpen_amount = 1.0
    if sharpen_amount > 0:
      blur = cv2.GaussianBlur(out, (0, 0), 1.2)
      out = cv2.addWeighted(out, 1.0 + sharpen_amount, blur, -sharpen_amount, 0)

    if args.contrast != 1.0:
      out = cv2.convertScaleAbs(out, alpha=args.contrast, beta=0)

    if args.saturation != 1.0:
      hsv = cv2.cvtColor(out, cv2.COLOR_BGR2HSV).astype(np.float32)
      hsv[:, :, 1] = np.clip(hsv[:, :, 1] * args.saturation, 0, 255)
      out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    if args.gamma > 0 and args.gamma != 1.0:
      inv = 1.0 / args.gamma
      table = np.array([((i / 255.0) ** inv) * 255 for i in range(256)]).astype('uint8')
      out = cv2.LUT(out, table)

    cv2.imwrite(args.output, out)


if __name__ == '__main__':
    main()
