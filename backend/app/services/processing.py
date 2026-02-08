import shlex
import subprocess
from pathlib import Path

import cv2
import numpy as np

from app.core.config import get_settings
from app.schemas import OpenCVOptions, ProcessRequest


class ProcessingService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def process_image(self, source: Path, destination: Path, options: ProcessRequest) -> None:
        working = source

        if options.colorize:
            working = self._step_deoldify(working, destination.with_name(destination.stem + "_colorized" + destination.suffix))

        if options.face_restore:
            working = self._step_gfpgan(working, destination.with_name(destination.stem + "_face" + destination.suffix))

        if options.upscale:
            working = self._step_realesrgan(working, destination.with_name(destination.stem + "_upscaled" + destination.suffix))

        if options.opencv is not None:
            working = self._step_opencv(working, destination.with_name(destination.stem + "_opencv" + destination.suffix), options.opencv)

        if working != destination:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(working.read_bytes())

    def _run_command_tool(self, command_template: str, input_path: Path, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        command = command_template.format(input=shlex.quote(str(input_path)), output=shlex.quote(str(output_path)))
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "External tool failed")
        if not output_path.exists():
            raise RuntimeError("Processing tool did not produce output file")
        return output_path

    def _step_realesrgan(self, input_path: Path, output_path: Path) -> Path:
        if self.settings.realesrgan_cmd:
            return self._run_command_tool(self.settings.realesrgan_cmd, input_path, output_path)

        try:
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("Real-ESRGAN unavailable. Set REALESRGAN_CMD or install realesrgan/basicsr.") from exc

        model_path = self.settings.realesrgan_model_path
        if not model_path:
            raise RuntimeError("REALESRGAN_MODEL_PATH is required for Python fallback")

        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        upsampler = RealESRGANer(scale=4, model_path=model_path, model=model)
        img = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
        if img is None:
            raise RuntimeError("Unable to read source image")
        output, _ = upsampler.enhance(img, outscale=4)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(output_path), output)
        return output_path

    def _step_gfpgan(self, input_path: Path, output_path: Path) -> Path:
        if self.settings.gfpgan_cmd:
            return self._run_command_tool(self.settings.gfpgan_cmd, input_path, output_path)

        try:
            from gfpgan import GFPGANer
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("GFPGAN unavailable. Set GFPGAN_CMD or install gfpgan.") from exc

        model_path = self.settings.gfpgan_model_path
        if not model_path:
            raise RuntimeError("GFPGAN_MODEL_PATH is required for Python fallback")

        bg_model_path = self.settings.gfpgan_upsampler_model_path
        if not bg_model_path:
            raise RuntimeError("GFPGAN_UPSAMPLER_MODEL_PATH is required for Python fallback")

        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        bg_model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        bg_upsampler = RealESRGANer(scale=2, model_path=bg_model_path, model=bg_model)
        restorer = GFPGANer(model_path=model_path, upscale=1, arch="clean", channel_multiplier=2, bg_upsampler=bg_upsampler)

        img = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
        if img is None:
            raise RuntimeError("Unable to read source image")
        _, _, restored_img = restorer.enhance(img, has_aligned=False, only_center_face=False, paste_back=True)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(output_path), restored_img)
        return output_path

    def _step_deoldify(self, input_path: Path, output_path: Path) -> Path:
        if self.settings.deoldify_cmd:
            return self._run_command_tool(self.settings.deoldify_cmd, input_path, output_path)
        raise RuntimeError("DeOldify requires DEOLDIFY_CMD integration in this build")

    def _step_opencv(self, input_path: Path, output_path: Path, options: OpenCVOptions) -> Path:
        image = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError("Unable to read source image")

        result = image.copy()

        if options.denoise:
            result = cv2.fastNlMeansDenoisingColored(result, None, 6, 6, 7, 21)

        if options.sharpen:
            kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
            result = cv2.filter2D(result, -1, kernel)

        if options.contrast != 1.0:
            result = cv2.convertScaleAbs(result, alpha=options.contrast, beta=0)

        if options.saturation != 1.0:
            hsv = cv2.cvtColor(result, cv2.COLOR_BGR2HSV).astype(np.float32)
            hsv[:, :, 1] = np.clip(hsv[:, :, 1] * options.saturation, 0, 255)
            result = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

        if options.gamma != 1.0 and options.gamma > 0:
            inv_gamma = 1.0 / options.gamma
            table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
            result = cv2.LUT(result, table)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(output_path), result)
        return output_path
