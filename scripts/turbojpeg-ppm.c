#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <turbojpeg.h>

/*
 * Decode JPEG with libjpeg-turbo, apply the same centered square crop used
 * by the bot's scale-to-fill + crop pipeline, and write a binary PPM.
 * cwebp remains responsible for resizing to 512x512 and WebP encoding.
 */
int main(int argc, char **argv) {
    if (argc != 3) {
        fprintf(stderr, "usage: turbojpeg-ppm input.jpg output.ppm\n");
        return 2;
    }

    FILE *in = fopen(argv[1], "rb");
    if (!in) { perror("open input"); return 3; }

    if (fseek(in, 0, SEEK_END) != 0) { fclose(in); return 3; }
    long file_len = ftell(in);
    if (file_len < 4 || file_len > 64L * 1024L * 1024L ||
        fseek(in, 0, SEEK_SET) != 0) {
        fprintf(stderr, "invalid or oversized JPEG file\n");
        fclose(in);
        return 4;
    }

    unsigned char *jpeg = (unsigned char *)malloc((size_t)file_len);
    if (!jpeg) { fclose(in); return 5; }
    size_t got = fread(jpeg, 1, (size_t)file_len, in);
    fclose(in);
    if (got != (size_t)file_len || jpeg[0] != 0xFF || jpeg[1] != 0xD8) {
        fprintf(stderr, "input is not a valid JPEG file\n");
        free(jpeg);
        return 6;
    }

    tjhandle handle = tjInitDecompress();
    if (!handle) {
        fprintf(stderr, "tjInitDecompress failed: %s\n", tjGetErrorStr());
        free(jpeg);
        return 7;
    }

    int width = 0, height = 0, subsamp = 0, colorspace = 0;
    if (tjDecompressHeader3(handle, jpeg, (unsigned long)file_len,
                            &width, &height, &subsamp, &colorspace) != 0 ||
        width <= 0 || height <= 0 ||
        (uint64_t)width * (uint64_t)height > 40000000ULL) {
        fprintf(stderr, "invalid JPEG dimensions or image exceeds 40 MP\n");
        tjDestroy(handle);
        free(jpeg);
        return 8;
    }

    int factor_count = 0;
    tjscalingfactor *factors = tjGetScalingFactors(&factor_count);
    int out_w = width, out_h = height;
    if (factors && factor_count > 0) {
        /* Use the smallest TurboJPEG decode that still leaves >=512px
           on both axes, reducing memory for large source images. */
        for (int i = 0; i < factor_count; i++) {
            int sw = TJSCALED(width, factors[i]);
            int sh = TJSCALED(height, factors[i]);
            if (sw >= 512 && sh >= 512 &&
                (sw < out_w || sh < out_h)) {
                out_w = sw;
                out_h = sh;
            }
        }
    }

    size_t rgb_size = (size_t)out_w * (size_t)out_h * 3U;
    unsigned char *rgb = (unsigned char *)malloc(rgb_size);
    if (!rgb) {
        fprintf(stderr, "not enough memory for decoded JPEG\n");
        tjDestroy(handle);
        free(jpeg);
        return 9;
    }

    if (tjDecompress2(handle, jpeg, (unsigned long)file_len, rgb,
                      out_w, 0, out_h, TJPF_RGB, TJFLAG_FASTDCT) != 0) {
        fprintf(stderr, "JPEG decode failed: %s\n", tjGetErrorStr());
        free(rgb);
        tjDestroy(handle);
        free(jpeg);
        return 10;
    }

    int side = out_w < out_h ? out_w : out_h;
    int x0 = (out_w - side) / 2;
    int y0 = (out_h - side) / 2;

    FILE *out = fopen(argv[2], "wb");
    if (!out) {
        perror("open output");
        free(rgb);
        tjDestroy(handle);
        free(jpeg);
        return 11;
    }

    if (fprintf(out, "P6\n%d %d\n255\n", side, side) < 0) {
        fclose(out);
        remove(argv[2]);
        free(rgb);
        tjDestroy(handle);
        free(jpeg);
        return 12;
    }

    for (int y = 0; y < side; y++) {
        const unsigned char *row =
            rgb + (((size_t)(y + y0) * (size_t)out_w + (size_t)x0) * 3U);
        if (fwrite(row, 3U, (size_t)side, out) != (size_t)side) {
            fprintf(stderr, "failed writing PPM output\n");
            fclose(out);
            remove(argv[2]);
            free(rgb);
            tjDestroy(handle);
            free(jpeg);
            return 13;
        }
    }

    if (fclose(out) != 0) {
        remove(argv[2]);
        free(rgb);
        tjDestroy(handle);
        free(jpeg);
        return 14;
    }

    free(rgb);
    tjDestroy(handle);
    free(jpeg);
    return 0;
}
