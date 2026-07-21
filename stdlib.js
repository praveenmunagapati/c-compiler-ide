/**
 * stdlib.js — Standard Library Headers & Runtime Sources for C Compiler
 */
"use strict";

function createStdlib(Lexer, Parser, FatalDiag, withDiag, INLINER, GOTO_NORMALIZER) {
const Stdlib = (() => {

const _stdlibHeaders = {
  "SDL.h": `
#pragma once
/* SDL3 subset (video + events + audio) for this compiler's web backend.
   The functional surface matches the old SDL2 subset; the spelling is SDL3:
   flat keyboard event (scancode/key, no nested keysym), float mouse coords,
   4-arg SDL_CreateWindow, SDL_AudioStream push API, bool returns, Uint64 ticks.
   host.js's primitive __sdl_* imports are unchanged — __SDL.c maps SDL3 onto
   them. Legacy SDL2 source must be updated (see vendor/{doom,quake,...}). */
__require_source("__SDL.c");

/* Real SDL.h pulls in <stddef.h> (via SDL_stdinc.h) so NULL/size_t are
   available to any program that only #includes <SDL.h> — match that. */
#include <stddef.h>

/* SDL3 uses C bool. Provide the type WITHOUT pulling in <stdbool.h>'s
   true/false macros, which would collide with code that defines its own
   (e.g. doomgeneric's 'typedef enum { false, true } boolean'). */
#ifndef __cplusplus
typedef _Bool bool;
#endif

typedef unsigned long long Uint64;
typedef unsigned int Uint32;
typedef unsigned short Uint16;
typedef unsigned char Uint8;
typedef int Sint32;

typedef Uint32 SDL_WindowID;
typedef Uint32 SDL_KeyboardID;
typedef Uint32 SDL_MouseID;
typedef Uint32 SDL_Scancode;
typedef Uint32 SDL_Keycode;
typedef Uint16 SDL_Keymod;

/* SDL3 made SDL_Surface a public struct. Match its field order + types so a
   program that reads surface->format / ->flags compiles and lays out the same.
   (This runtime only ever hands back RGBA32 window surfaces; refcount/reserved
   are inert here but present for layout fidelity.) */
typedef Uint32 SDL_PixelFormat;
typedef Uint32 SDL_SurfaceFlags;
typedef struct SDL_Surface {
    SDL_SurfaceFlags flags;
    SDL_PixelFormat format;
    int w, h;
    int pitch;
    void *pixels;
    int refcount;
    void *reserved;
} SDL_Surface;

typedef struct SDL_Window SDL_Window;

typedef struct SDL_Rect {
    int x, y, w, h;
} SDL_Rect;

typedef struct SDL_FRect {
    float x, y, w, h;
} SDL_FRect;

typedef struct SDL_FPoint { float x, y; } SDL_FPoint;
typedef struct SDL_FColor { float r, g, b, a; } SDL_FColor;

/* SDL_RenderGeometry vertex: position (render pixels), color (0..1 floats), and
   normalized (0..1) tex coords. */
typedef struct SDL_Vertex {
    SDL_FPoint position;
    SDL_FColor color;
    SDL_FPoint tex_coord;
} SDL_Vertex;

/* SDL_Renderer (2D accelerated). The host renders batched quads on WebGPU; the
   pixel format is informational only (textures are RGBA bytes in memory). */
typedef struct SDL_Renderer SDL_Renderer;

/* SDL_PixelFormat is typedef'd above (with SDL_Surface). Byte-order packed RGBA
   formats; the host treats every texture as RGBA bytes, so the exact value is
   informational. SDL_PIXELFORMAT_RGBA32 is defined ONCE, below, to the
   little-endian-correct value (== ABGR8888) — no conflicting redefinition. */
#define SDL_PIXELFORMAT_RGBA8888 0x16462004u
#define SDL_PIXELFORMAT_ABGR8888 0x16762004u

/* Pixel-format bitfield accessors + classification (SDL_pixels.h). Just enough
   for SDL_ISPIXELFORMAT_ALPHA, which SDL_CreateTexture uses to pick SDL3's
   alpha-aware default blend mode. These are pure bit math on the packed format
   id, so they're correct for any SDL pixel format, not only the ones we ship. */
#define SDL_PIXELFLAG(X)   (((X) >> 28) & 0x0F)
#define SDL_PIXELTYPE(X)   (((X) >> 24) & 0x0F)
#define SDL_PIXELORDER(X)  (((X) >> 20) & 0x0F)
#define SDL_PIXELTYPE_PACKED8  4
#define SDL_PIXELTYPE_PACKED16 5
#define SDL_PIXELTYPE_PACKED32 6
#define SDL_PACKEDORDER_ARGB 3
#define SDL_PACKEDORDER_RGBA 4
#define SDL_PACKEDORDER_ABGR 7
#define SDL_PACKEDORDER_BGRA 8
/* FOURCC formats carry flag != 1; the named RGBA formats all carry flag == 1. */
#define SDL_ISPIXELFORMAT_FOURCC(format) ((format) && (SDL_PIXELFLAG(format) != 1))
#define SDL_ISPIXELFORMAT_PACKED(format) \
    (!SDL_ISPIXELFORMAT_FOURCC(format) && \
     ((SDL_PIXELTYPE(format) == SDL_PIXELTYPE_PACKED8) || \
      (SDL_PIXELTYPE(format) == SDL_PIXELTYPE_PACKED16) || \
      (SDL_PIXELTYPE(format) == SDL_PIXELTYPE_PACKED32)))
#define SDL_ISPIXELFORMAT_ALPHA(format) \
    (SDL_ISPIXELFORMAT_PACKED(format) && \
     ((SDL_PIXELORDER(format) == SDL_PACKEDORDER_ARGB) || \
      (SDL_PIXELORDER(format) == SDL_PACKEDORDER_RGBA) || \
      (SDL_PIXELORDER(format) == SDL_PACKEDORDER_ABGR) || \
      (SDL_PIXELORDER(format) == SDL_PACKEDORDER_BGRA)))

typedef enum SDL_TextureAccess {
    SDL_TEXTUREACCESS_STATIC = 0,
    SDL_TEXTUREACCESS_STREAMING = 1,
    SDL_TEXTUREACCESS_TARGET = 2
} SDL_TextureAccess;

typedef enum SDL_BlendMode {
    SDL_BLENDMODE_NONE = 0,
    SDL_BLENDMODE_BLEND = 1,
    SDL_BLENDMODE_ADD = 2,
    SDL_BLENDMODE_MOD = 4
} SDL_BlendMode;

typedef enum SDL_ScaleMode {
    SDL_SCALEMODE_NEAREST = 0,
    SDL_SCALEMODE_LINEAR = 1
} SDL_ScaleMode;

/* SDL3 SDL_Texture exposes format/w/h as public fields (programs read tex->w/h);
   the host handle is an internal trailer. */
typedef struct SDL_Texture {
    SDL_PixelFormat format;
    int w;
    int h;
    int __handle;
} SDL_Texture;

/* Fields common to the head of every SDL event (type/reserved/timestamp), shared
   layout so SDL_Event.common can read them for any event. */
typedef struct SDL_CommonEvent {
    Uint32 type;
    Uint32 reserved;
    Uint64 timestamp;
} SDL_CommonEvent;

/* SDL3 flattened the keyboard event: scancode/key live directly on the event
   (no SDL_Keysym sub-struct), timestamps are Uint64, and state is a bool down. */
typedef struct SDL_KeyboardEvent {
    Uint32 type;
    Uint32 reserved;
    Uint64 timestamp;
    SDL_WindowID windowID;
    SDL_KeyboardID which;
    SDL_Scancode scancode;
    SDL_Keycode key;
    SDL_Keymod mod;
    Uint16 raw;
    bool down;
    bool repeat;
} SDL_KeyboardEvent;

typedef struct SDL_MouseMotionEvent {
    Uint32 type;
    Uint32 reserved;
    Uint64 timestamp;
    SDL_WindowID windowID;
    SDL_MouseID which;
    Uint32 state;
    float x;
    float y;
    float xrel;
    float yrel;
} SDL_MouseMotionEvent;

typedef struct SDL_MouseButtonEvent {
    Uint32 type;
    Uint32 reserved;
    Uint64 timestamp;
    SDL_WindowID windowID;
    SDL_MouseID which;
    Uint8 button;
    bool down;
    Uint8 clicks;
    Uint8 padding;
    float x;
    float y;
} SDL_MouseButtonEvent;

typedef struct SDL_MouseWheelEvent {
    Uint32 type;
    Uint32 reserved;
    Uint64 timestamp;
    SDL_WindowID windowID;
    SDL_MouseID which;
    float x;
    float y;
    Uint32 direction;
    float mouse_x;
    float mouse_y;
} SDL_MouseWheelEvent;

/* SDL3 window event: data1/data2 are event-dependent (RESIZED: new w/h). */
typedef struct SDL_WindowEvent {
    Uint32 type;
    Uint32 reserved;
    Uint64 timestamp;
    SDL_WindowID windowID;
    Sint32 data1;
    Sint32 data2;
} SDL_WindowEvent;

typedef union SDL_Event {
    Uint32 type;
    SDL_CommonEvent common;
    SDL_KeyboardEvent key;
    SDL_MouseMotionEvent motion;
    SDL_MouseButtonEvent button;
    SDL_MouseWheelEvent wheel;
    SDL_WindowEvent window;
    Uint8 padding[128];
} SDL_Event;

typedef Uint32 SDL_InitFlags;
typedef Uint64 SDL_WindowFlags;
#define SDL_INIT_AUDIO 0x00000010u
#define SDL_INIT_VIDEO 0x00000020u
#define SDL_INIT_JOYSTICK 0x00000200u
#define SDL_INIT_HAPTIC 0x00001000u
#define SDL_INIT_GAMEPAD 0x00002000u
#define SDL_INIT_EVENTS 0x00004000u
#define SDL_INIT_SENSOR 0x00008000u
#define SDL_INIT_CAMERA 0x00010000u
#define SDL_WINDOW_FULLSCREEN 0x0000000000000001ULL
/* Borderless: under the OS WM this is a kernel surface with no chrome
   (taskbar-class windows — todos/0014); standalone runtimes ignore it. */
#define SDL_WINDOW_BORDERLESS 0x0000000000000010ULL
/* Resizable: declared by apps that handle SDL_EVENT_WINDOW_RESIZED (the
   0019 renegotiation). Accepted everywhere; todos/0021 will make the WM
   offer resize ONLY to windows that declare it. */
#define SDL_WINDOW_RESIZABLE 0x0000000000000020ULL
/* Transparent (SDL3 value): under the OS WM the surface's per-pixel alpha
   is honored — the compositor blends it src-over (todos/0063). Standalone
   runtimes ignore it (the page canvas is opaque). */
#define SDL_WINDOW_TRANSPARENT 0x0000000040000000ULL
/* Popup windows (SDL3 values; todos/0256): created via SDL_CreatePopupWindow
   as kernel ANCHORED CHILD surfaces — borderless, pinned to their parent at
   a fixed offset, moved/hidden/raised/destroyed/scaled with it, never
   focused. POPUP_MENU additionally holds the kernel GRAB while it lives: a
   press outside its window tree dismisses it (the popup's window gets
   SDL_EVENT_WINDOW_CLOSE_REQUESTED) and the press is consumed — Win95
   menu-mode capture. TOOLTIP does not grab. */
#define SDL_WINDOW_TOOLTIP 0x0000000000040000ULL
#define SDL_WINDOW_POPUP_MENU 0x0000000000080000ULL
#define SDL_WINDOWPOS_CENTERED 0x2FFF0000
#define SDL_WINDOWPOS_UNDEFINED 0x1FFF0000
/* SDL3: on little-endian, SDL_PIXELFORMAT_RGBA32 aliases ABGR8888
   (0x16762004 = 376840196). Single canonical definition. */
#define SDL_PIXELFORMAT_RGBA32 0x16762004u
#define SDL_PIXELFORMAT_XRGB8888 0x16161804u

/* SDL3 event types (SDL_EVENT_*). Values are unchanged from SDL2. */
#define SDL_EVENT_QUIT 0x100
/* SDL3 window events (flattened enum, one type per event). Only RESIZED is
   delivered today — the OS WM's client-resize protocol (todos/0019); the
   rest of the block is defined for source compatibility. */
#define SDL_EVENT_WINDOW_SHOWN 0x202
#define SDL_EVENT_WINDOW_HIDDEN 0x203
#define SDL_EVENT_WINDOW_EXPOSED 0x204
#define SDL_EVENT_WINDOW_MOVED 0x205
#define SDL_EVENT_WINDOW_RESIZED 0x206
#define SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED 0x207
/* The owner focus pair (todos/0256): the kernel emits these at EVERY focus
   transition — another window's create-steal, a click/WM focus, and the
   focus fall after a destroy/minimize — via its single focus choke point. */
#define SDL_EVENT_WINDOW_FOCUS_GAINED 0x20E
#define SDL_EVENT_WINDOW_FOCUS_LOST 0x20F
/* Delivered when the kernel's close request ('x' / wmctl close) names a
   window and OTHER windows are still live (todos/0089) — a multi-window
   process closes just that window. A single (or last) window keeps the
   process-wide SDL_EVENT_QUIT it always got. */
#define SDL_EVENT_WINDOW_CLOSE_REQUESTED 0x210
#define SDL_EVENT_KEY_DOWN 0x300
#define SDL_EVENT_KEY_UP 0x301
#define SDL_EVENT_MOUSE_MOTION 0x400
#define SDL_EVENT_MOUSE_BUTTON_DOWN 0x401
#define SDL_EVENT_MOUSE_BUTTON_UP 0x402
#define SDL_EVENT_MOUSE_WHEEL 0x403
#define SDL_BUTTON_LEFT 1
#define SDL_BUTTON_MIDDLE 2
#define SDL_BUTTON_RIGHT 3

#define SDLK_BACKSPACE 8
#define SDLK_TAB 9
#define SDLK_RETURN 13
#define SDLK_ESCAPE 27
#define SDLK_SPACE 32
#define SDLK_PLUS 43
#define SDLK_MINUS 45
#define SDLK_EQUALS 61
#define SDLK_DELETE 127
#define SDLK_CAPSLOCK 1073741881
#define SDLK_F1 1073741882
#define SDLK_F2 1073741883
#define SDLK_F3 1073741884
#define SDLK_F4 1073741885
#define SDLK_F5 1073741886
#define SDLK_F6 1073741887
#define SDLK_F7 1073741888
#define SDLK_F8 1073741889
#define SDLK_F9 1073741890
#define SDLK_F10 1073741891
#define SDLK_F11 1073741892
#define SDLK_F12 1073741893
#define SDLK_PRINTSCREEN 1073741894
#define SDLK_SCROLLLOCK 1073741895
#define SDLK_PAUSE 1073741896
#define SDLK_INSERT 1073741897
#define SDLK_HOME 1073741898
#define SDLK_PAGEUP 1073741899
#define SDLK_END 1073741901
#define SDLK_PAGEDOWN 1073741902
#define SDLK_RIGHT 1073741903
#define SDLK_LEFT 1073741904
#define SDLK_DOWN 1073741905
#define SDLK_UP 1073741906
#define SDLK_NUMLOCKCLEAR 1073741907
#define SDLK_LCTRL 1073742048
#define SDLK_LSHIFT 1073742049
#define SDLK_LALT 1073742050
#define SDLK_RCTRL 1073742052
#define SDLK_RSHIFT 1073742053
#define SDLK_RALT 1073742054

/* SDL3 key modifier flags (SDL_Keymod, SDL_keycode.h). Populated on
   event.key.mod from the DOM modifier state. */
#define SDL_KMOD_NONE   0x0000
#define SDL_KMOD_LSHIFT 0x0001
#define SDL_KMOD_RSHIFT 0x0002
#define SDL_KMOD_LCTRL  0x0040
#define SDL_KMOD_RCTRL  0x0080
#define SDL_KMOD_LALT   0x0100
#define SDL_KMOD_RALT   0x0200
#define SDL_KMOD_LGUI   0x0400
#define SDL_KMOD_RGUI   0x0800
#define SDL_KMOD_NUM    0x1000
#define SDL_KMOD_CAPS   0x2000
#define SDL_KMOD_MODE   0x4000
#define SDL_KMOD_SCROLL 0x8000
#define SDL_KMOD_CTRL  (SDL_KMOD_LCTRL | SDL_KMOD_RCTRL)
#define SDL_KMOD_SHIFT (SDL_KMOD_LSHIFT | SDL_KMOD_RSHIFT)
#define SDL_KMOD_ALT   (SDL_KMOD_LALT | SDL_KMOD_RALT)
#define SDL_KMOD_GUI   (SDL_KMOD_LGUI | SDL_KMOD_RGUI)

/* SDL_MouseWheelDirection */
#define SDL_MOUSEWHEEL_NORMAL  0
#define SDL_MOUSEWHEEL_FLIPPED 1

/* SDL button mask helper (SDL_mouse.h): SDL_BUTTON_MASK(b) == 1u << (b-1). */
#define SDL_BUTTON_MASK(X) (1u << ((X) - 1))

/* SDL3 audio format constants (SDL_AUDIO_*). Values are unchanged from SDL2. */
typedef int SDL_AudioFormat;
#define SDL_AUDIO_U8 0x0008
#define SDL_AUDIO_S8 0x8008
#define SDL_AUDIO_S16 0x8010
#define SDL_AUDIO_S32 0x8020
#define SDL_AUDIO_F32 0x8120

typedef Uint32 SDL_AudioDeviceID;
#define SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK 0xFFFFFFFFu

/* SDL3 reordered SDL_AudioSpec to {format, channels, freq} and dropped the
   SDL2 callback/samples/silence/size fields. */
typedef struct SDL_AudioSpec {
    SDL_AudioFormat format;
    int channels;
    int freq;
} SDL_AudioSpec;

typedef struct SDL_AudioStream SDL_AudioStream;
typedef void (*SDL_AudioStreamCallback)(void *userdata, SDL_AudioStream *stream,
                                        int additional_amount, int total_amount);

bool SDL_Init(SDL_InitFlags flags);
bool SDL_InitSubSystem(SDL_InitFlags flags);
void SDL_QuitSubSystem(SDL_InitFlags flags);
SDL_InitFlags SDL_WasInit(SDL_InitFlags flags);
SDL_Window *SDL_CreateWindow(const char *title, int w, int h, SDL_WindowFlags flags);
/* SDL_CreatePopupWindow / SDL_GetDisplayBounds (todos/0256) live in
   <SDL_popup.h> — a subsidiary header on the sdl3webgpu.h precedent, so the
   popup TU (and its host imports) links only into binaries that use popups
   instead of growing every SDL binary's import table. */
SDL_WindowID SDL_GetWindowID(SDL_Window *window);
SDL_Surface *SDL_GetWindowSurface(SDL_Window *window);
bool SDL_UpdateWindowSurface(SDL_Window *window);
bool SDL_GetWindowSize(SDL_Window *window, int *w, int *h);
bool SDL_SetWindowSize(SDL_Window *window, int w, int h);
bool SDL_PollEvent(SDL_Event *event);
bool SDL_WaitEvent(SDL_Event *event);
bool SDL_WaitEventTimeout(SDL_Event *event, Sint32 timeoutMS);
void SDL_DestroyWindow(SDL_Window *window);
void SDL_Quit(void);
void SDL_Delay(Uint32 ms);
Uint64 SDL_GetTicks(void);
bool SDL_SetWindowTitle(SDL_Window *window, const char *title);
bool SDL_SetWindowRelativeMouseMode(SDL_Window *window, bool enabled);
bool SDL_GetWindowRelativeMouseMode(SDL_Window *window);
void __setAnimationFrameFunc(void (*callback)(void));

/* ---- Cursors (SDL_mouse.h; todos/0105) ----
   System shapes only — the pointer is the native browser cursor (WM.md
   deviation: no kernel sprite), so a cursor is just a CSS-name enum the host
   feeds to the canvas cursor style. SDL_CreateCursor (custom pixel cursors)
   stays out of scope. The kernel derives chrome cursors (resize edges) from
   its own hit test and OVERLAYS them over the client cursor an app sets here;
   with one window per process, SDL_SetCursor targets that process's surface.
   SDL_SetCursor(NULL) is SDL3's "redraw the current cursor" no-op. */
typedef enum SDL_SystemCursor {
    SDL_SYSTEM_CURSOR_DEFAULT,        /* 0  arrow */
    SDL_SYSTEM_CURSOR_TEXT,           /* 1  I-beam */
    SDL_SYSTEM_CURSOR_WAIT,           /* 2 */
    SDL_SYSTEM_CURSOR_CROSSHAIR,      /* 3 */
    SDL_SYSTEM_CURSOR_PROGRESS,       /* 4 */
    SDL_SYSTEM_CURSOR_NWSE_RESIZE,    /* 5  \ diagonal */
    SDL_SYSTEM_CURSOR_NESW_RESIZE,    /* 6  / diagonal */
    SDL_SYSTEM_CURSOR_EW_RESIZE,      /* 7  horizontal */
    SDL_SYSTEM_CURSOR_NS_RESIZE,      /* 8  vertical */
    SDL_SYSTEM_CURSOR_MOVE,           /* 9  four-way */
    SDL_SYSTEM_CURSOR_NOT_ALLOWED,    /* 10 */
    SDL_SYSTEM_CURSOR_POINTER,        /* 11 hand */
    SDL_SYSTEM_CURSOR_NW_RESIZE,      /* 12 */
    SDL_SYSTEM_CURSOR_N_RESIZE,       /* 13 */
    SDL_SYSTEM_CURSOR_NE_RESIZE,      /* 14 */
    SDL_SYSTEM_CURSOR_E_RESIZE,       /* 15 */
    SDL_SYSTEM_CURSOR_SE_RESIZE,      /* 16 */
    SDL_SYSTEM_CURSOR_S_RESIZE,       /* 17 */
    SDL_SYSTEM_CURSOR_SW_RESIZE,      /* 18 */
    SDL_SYSTEM_CURSOR_W_RESIZE,       /* 19 */
    SDL_SYSTEM_CURSOR_COUNT
} SDL_SystemCursor;

typedef struct SDL_Cursor SDL_Cursor;
SDL_Cursor *SDL_CreateSystemCursor(SDL_SystemCursor id);
bool SDL_SetCursor(SDL_Cursor *cursor);
SDL_Cursor *SDL_GetCursor(void);
SDL_Cursor *SDL_GetDefaultCursor(void);
void SDL_DestroyCursor(SDL_Cursor *cursor);
bool SDL_ShowCursor(void);
bool SDL_HideCursor(void);
bool SDL_CursorVisible(void);

/* ---- Clipboard (SDL_clipboard.h; todos/0090) ----
   Text only. One system-wide slot held by the OS kernel — copy/paste crosses
   processes and survives the writer exiting; standalone runs get a
   process-local slot with identical semantics. Usable without SDL_Init (the
   win32 veneer's clipboard rides this from console-shaped processes).
   SDL_GetClipboardText follows SDL3's contract: never NULL, "" when empty or
   on error, caller frees with SDL_free. */
bool SDL_SetClipboardText(const char *text);
char *SDL_GetClipboardText(void);
bool SDL_HasClipboardText(void);
bool SDL_ClearClipboardData(void);
void SDL_free(void *mem);

SDL_AudioStream *SDL_OpenAudioDeviceStream(SDL_AudioDeviceID devid,
                                           const SDL_AudioSpec *spec,
                                           SDL_AudioStreamCallback callback,
                                           void *userdata);
bool SDL_PutAudioStreamData(SDL_AudioStream *stream, const void *buf, int len);
int SDL_GetAudioStreamQueued(SDL_AudioStream *stream);
bool SDL_ClearAudioStream(SDL_AudioStream *stream);
bool SDL_ResumeAudioStreamDevice(SDL_AudioStream *stream);
bool SDL_PauseAudioStreamDevice(SDL_AudioStream *stream);
void SDL_DestroyAudioStream(SDL_AudioStream *stream);

/* ---- Error handling ----
   SDL keeps a per-thread error string; this runtime is single-threaded, so it's
   a single global. SDL_GetError never returns NULL (empty when no error).
   SDL_SetError always returns false and SDL_ClearError always returns true,
   matching SDL3's bool-returning convention (so \`return SDL_SetError(...)\` is
   the idiomatic early-out from a function that returns bool). */
const char *SDL_GetError(void);
bool SDL_SetError(const char *fmt, ...);
bool SDL_ClearError(void);
/* SDL3's standard "invalid parameter" helper (SDL_error.h). Expands to a
   SDL_SetError with SDL's exact wording, so SDL_GetError() after passing a NULL
   handle reads like upstream ("Parameter 'renderer' is invalid"). */
#define SDL_InvalidParamError(param) SDL_SetError("Parameter '%s' is invalid", (param))

/* ---- SDL_Renderer (2D accelerated) ---- */
SDL_Renderer *SDL_CreateRenderer(SDL_Window *window, const char *name);
void SDL_DestroyRenderer(SDL_Renderer *renderer);
SDL_Texture *SDL_CreateTexture(SDL_Renderer *renderer, SDL_PixelFormat format, SDL_TextureAccess access, int w, int h);
SDL_Texture *SDL_CreateTextureFromSurface(SDL_Renderer *renderer, SDL_Surface *surface);
void SDL_DestroyTexture(SDL_Texture *texture);
bool SDL_UpdateTexture(SDL_Texture *texture, const SDL_Rect *rect, const void *pixels, int pitch);
bool SDL_SetTextureColorMod(SDL_Texture *texture, Uint8 r, Uint8 g, Uint8 b);
bool SDL_SetTextureAlphaMod(SDL_Texture *texture, Uint8 alpha);
bool SDL_SetTextureBlendMode(SDL_Texture *texture, SDL_BlendMode blendMode);
bool SDL_GetTextureBlendMode(SDL_Texture *texture, SDL_BlendMode *blendMode);
bool SDL_SetTextureScaleMode(SDL_Texture *texture, SDL_ScaleMode scaleMode);
bool SDL_GetTextureScaleMode(SDL_Texture *texture, SDL_ScaleMode *scaleMode);
bool SDL_SetRenderDrawColor(SDL_Renderer *renderer, Uint8 r, Uint8 g, Uint8 b, Uint8 a);
bool SDL_SetRenderDrawBlendMode(SDL_Renderer *renderer, SDL_BlendMode blendMode);
bool SDL_RenderClear(SDL_Renderer *renderer);
bool SDL_RenderTexture(SDL_Renderer *renderer, SDL_Texture *texture, const SDL_FRect *srcrect, const SDL_FRect *dstrect);
bool SDL_RenderFillRect(SDL_Renderer *renderer, const SDL_FRect *rect);
bool SDL_RenderRect(SDL_Renderer *renderer, const SDL_FRect *rect);
bool SDL_RenderLine(SDL_Renderer *renderer, float x1, float y1, float x2, float y2);
bool SDL_RenderPoint(SDL_Renderer *renderer, float x, float y);
bool SDL_RenderGeometry(SDL_Renderer *renderer, SDL_Texture *texture, const SDL_Vertex *vertices, int num_vertices, const int *indices, int num_indices);
void SDL_RenderPresent(SDL_Renderer *renderer);
  `,
  "webgpu.h": `
#pragma once
/* WebGPU for this compiler's web backend (modern Dawn/Emdawnwebgpu dialect).
   The browser's WebGPU JS API is exposed to C. webgpu.h declares the standard
   types + wgpu* prototypes; __webgpu.c flattens descriptor structs (the C
   compiler's layout is authoritative) and forwards PRIMITIVES to host.js's
   __wgpu_* imports — so the host never hand-computes C struct offsets, mirroring
   __SDL.c's "host knows nothing about C struct layouts" design. Async
   (requestAdapter/requestDevice) is callback-based (NO JSPI): the host invokes
   C trampolines (__wgpu_call_*_cb) which reconstruct the by-value WGPUStringView
   and call the user callback. Frames run on the shared rAF loop via
   wgpuSetMainLoopCallback. See todos/WEBGPU.md. */
__require_source("__webgpu.c");

#include <stddef.h>
#include <stdint.h>

#ifndef __cplusplus
#ifndef __WGPU_BOOL_DEFINED
#define __WGPU_BOOL_DEFINED
#endif
#endif

typedef uint32_t WGPUFlags;
typedef uint32_t WGPUBool;

/* Opaque handles (host-side handle-table indices, pointer-width). */
typedef struct WGPUInstanceImpl*          WGPUInstance;
typedef struct WGPUAdapterImpl*           WGPUAdapter;
typedef struct WGPUDeviceImpl*            WGPUDevice;
typedef struct WGPUQueueImpl*             WGPUQueue;
typedef struct WGPUSurfaceImpl*           WGPUSurface;
typedef struct WGPUTextureImpl*           WGPUTexture;
typedef struct WGPUTextureViewImpl*       WGPUTextureView;
typedef struct WGPUShaderModuleImpl*      WGPUShaderModule;
typedef struct WGPUPipelineLayoutImpl*    WGPUPipelineLayout;
typedef struct WGPURenderPipelineImpl*    WGPURenderPipeline;
typedef struct WGPUCommandEncoderImpl*    WGPUCommandEncoder;
typedef struct WGPURenderPassEncoderImpl* WGPURenderPassEncoder;
typedef struct WGPUCommandBufferImpl*     WGPUCommandBuffer;
typedef struct WGPUBufferImpl*            WGPUBuffer;
typedef struct WGPUBindGroupLayoutImpl*   WGPUBindGroupLayout;
typedef struct WGPUBindGroupImpl*         WGPUBindGroup;
typedef struct WGPUSamplerImpl*           WGPUSampler;
typedef struct WGPUComputePipelineImpl*   WGPUComputePipeline;
typedef struct WGPUComputePassEncoderImpl* WGPUComputePassEncoder;

/* WGPUStringView: ptr+len string (NULL data + 0 length == "use default"). */
typedef struct WGPUStringView {
    const char *data;
    size_t length;
} WGPUStringView;
#define WGPU_STRLEN ((size_t)-1)
#define WGPU_WHOLE_SIZE (0xFFFFFFFFFFFFFFFFULL)
#define WGPU_WHOLE_MAP_SIZE ((size_t)-1)

/* WGPUFuture: opaque async token. We drive completion via callbacks, so the id
   is a plain monotonic counter the user does not need to inspect. */
typedef struct WGPUFuture { uint64_t id; } WGPUFuture;

typedef struct WGPUColor { double r, g, b, a; } WGPUColor;

/* ---- Enums (values are self-consistent header<->host; use the NAMES). ---- */
typedef enum WGPUSType {
    WGPUSType_ShaderSourceWGSL = 2
} WGPUSType;

typedef enum WGPURequestAdapterStatus {
    WGPURequestAdapterStatus_Success = 1,
    WGPURequestAdapterStatus_Unavailable = 2,
    WGPURequestAdapterStatus_Error = 3
} WGPURequestAdapterStatus;

typedef enum WGPURequestDeviceStatus {
    WGPURequestDeviceStatus_Success = 1,
    WGPURequestDeviceStatus_Error = 3
} WGPURequestDeviceStatus;

typedef enum WGPUCallbackMode {
    WGPUCallbackMode_WaitAnyOnly = 1,
    WGPUCallbackMode_AllowProcessEvents = 2,
    WGPUCallbackMode_AllowSpontaneous = 3
} WGPUCallbackMode;

typedef enum WGPUPowerPreference {
    WGPUPowerPreference_Undefined = 0,
    WGPUPowerPreference_LowPower = 1,
    WGPUPowerPreference_HighPerformance = 2
} WGPUPowerPreference;

/* Full WebGPU texture format set. Uncompressed formats use canonical webgpu.h
   values (1-44); the 9 historical entries (18/19/23/24, 40-44) are unchanged.
   Compressed formats (feature-gated: texture-compression-bc/etc2/astc) live at
   100+ and resolve only when the adapter exposes the feature. The host map is
   the single source of truth (int->string); unknown values fail loud. */
typedef enum WGPUTextureFormat {
    WGPUTextureFormat_Undefined            = 0,
    WGPUTextureFormat_R8Unorm              = 1,
    WGPUTextureFormat_R8Snorm              = 2,
    WGPUTextureFormat_R8Uint               = 3,
    WGPUTextureFormat_R8Sint               = 4,
    WGPUTextureFormat_R16Uint              = 5,
    WGPUTextureFormat_R16Sint              = 6,
    WGPUTextureFormat_R16Float             = 7,
    WGPUTextureFormat_RG8Unorm             = 8,
    WGPUTextureFormat_RG8Snorm             = 9,
    WGPUTextureFormat_RG8Uint              = 10,
    WGPUTextureFormat_RG8Sint              = 11,
    WGPUTextureFormat_R32Float             = 12,
    WGPUTextureFormat_R32Uint              = 13,
    WGPUTextureFormat_R32Sint              = 14,
    WGPUTextureFormat_RG16Uint             = 15,
    WGPUTextureFormat_RG16Sint             = 16,
    WGPUTextureFormat_RG16Float            = 17,
    WGPUTextureFormat_RGBA8Unorm           = 18,
    WGPUTextureFormat_RGBA8UnormSrgb       = 19,
    WGPUTextureFormat_RGBA8Snorm           = 20,
    WGPUTextureFormat_RGBA8Uint            = 21,
    WGPUTextureFormat_RGBA8Sint            = 22,
    WGPUTextureFormat_BGRA8Unorm           = 23,
    WGPUTextureFormat_BGRA8UnormSrgb       = 24,
    WGPUTextureFormat_RGB10A2Uint          = 25,
    WGPUTextureFormat_RGB10A2Unorm         = 26,
    WGPUTextureFormat_RG11B10Ufloat        = 27,
    WGPUTextureFormat_RGB9E5Ufloat         = 28,
    WGPUTextureFormat_RG32Float            = 29,
    WGPUTextureFormat_RG32Uint             = 30,
    WGPUTextureFormat_RG32Sint             = 31,
    WGPUTextureFormat_RGBA16Uint           = 32,
    WGPUTextureFormat_RGBA16Sint           = 33,
    WGPUTextureFormat_RGBA16Float          = 34,
    WGPUTextureFormat_RGBA32Float          = 35,
    WGPUTextureFormat_RGBA32Uint           = 36,
    WGPUTextureFormat_RGBA32Sint           = 37,
    WGPUTextureFormat_Stencil8             = 38,
    WGPUTextureFormat_Depth16Unorm         = 40,
    WGPUTextureFormat_Depth24Plus          = 41,
    WGPUTextureFormat_Depth24PlusStencil8  = 42,
    WGPUTextureFormat_Depth32Float         = 43,
    WGPUTextureFormat_Depth32FloatStencil8 = 44,
    /* --- compressed (feature-gated) --- */
    WGPUTextureFormat_BC1RGBAUnorm         = 100,
    WGPUTextureFormat_BC1RGBAUnormSrgb     = 101,
    WGPUTextureFormat_BC2RGBAUnorm         = 102,
    WGPUTextureFormat_BC2RGBAUnormSrgb     = 103,
    WGPUTextureFormat_BC3RGBAUnorm         = 104,
    WGPUTextureFormat_BC3RGBAUnormSrgb     = 105,
    WGPUTextureFormat_BC4RUnorm            = 106,
    WGPUTextureFormat_BC4RSnorm            = 107,
    WGPUTextureFormat_BC5RGUnorm           = 108,
    WGPUTextureFormat_BC5RGSnorm           = 109,
    WGPUTextureFormat_BC6HRGBUfloat        = 110,
    WGPUTextureFormat_BC6HRGBFloat         = 111,
    WGPUTextureFormat_BC7RGBAUnorm         = 112,
    WGPUTextureFormat_BC7RGBAUnormSrgb     = 113,
    WGPUTextureFormat_ETC2RGB8Unorm        = 114,
    WGPUTextureFormat_ETC2RGB8UnormSrgb    = 115,
    WGPUTextureFormat_ETC2RGB8A1Unorm      = 116,
    WGPUTextureFormat_ETC2RGB8A1UnormSrgb  = 117,
    WGPUTextureFormat_ETC2RGBA8Unorm       = 118,
    WGPUTextureFormat_ETC2RGBA8UnormSrgb   = 119,
    WGPUTextureFormat_EACR11Unorm          = 120,
    WGPUTextureFormat_EACR11Snorm          = 121,
    WGPUTextureFormat_EACRG11Unorm         = 122,
    WGPUTextureFormat_EACRG11Snorm         = 123,
    WGPUTextureFormat_ASTC4x4Unorm         = 124,
    WGPUTextureFormat_ASTC4x4UnormSrgb     = 125,
    WGPUTextureFormat_ASTC5x4Unorm         = 126,
    WGPUTextureFormat_ASTC5x4UnormSrgb     = 127,
    WGPUTextureFormat_ASTC5x5Unorm         = 128,
    WGPUTextureFormat_ASTC5x5UnormSrgb     = 129,
    WGPUTextureFormat_ASTC6x5Unorm         = 130,
    WGPUTextureFormat_ASTC6x5UnormSrgb     = 131,
    WGPUTextureFormat_ASTC6x6Unorm         = 132,
    WGPUTextureFormat_ASTC6x6UnormSrgb     = 133,
    WGPUTextureFormat_ASTC8x5Unorm         = 134,
    WGPUTextureFormat_ASTC8x5UnormSrgb     = 135,
    WGPUTextureFormat_ASTC8x6Unorm         = 136,
    WGPUTextureFormat_ASTC8x6UnormSrgb     = 137,
    WGPUTextureFormat_ASTC8x8Unorm         = 138,
    WGPUTextureFormat_ASTC8x8UnormSrgb     = 139,
    WGPUTextureFormat_ASTC10x5Unorm        = 140,
    WGPUTextureFormat_ASTC10x5UnormSrgb    = 141,
    WGPUTextureFormat_ASTC10x6Unorm        = 142,
    WGPUTextureFormat_ASTC10x6UnormSrgb    = 143,
    WGPUTextureFormat_ASTC10x8Unorm        = 144,
    WGPUTextureFormat_ASTC10x8UnormSrgb    = 145,
    WGPUTextureFormat_ASTC10x10Unorm       = 146,
    WGPUTextureFormat_ASTC10x10UnormSrgb   = 147,
    WGPUTextureFormat_ASTC12x10Unorm       = 148,
    WGPUTextureFormat_ASTC12x10UnormSrgb   = 149,
    WGPUTextureFormat_ASTC12x12Unorm       = 150,
    WGPUTextureFormat_ASTC12x12UnormSrgb   = 151
} WGPUTextureFormat;

typedef enum WGPULoadOp {
    WGPULoadOp_Undefined = 0,
    WGPULoadOp_Clear = 1,
    WGPULoadOp_Load = 2
} WGPULoadOp;

typedef enum WGPUStoreOp {
    WGPUStoreOp_Undefined = 0,
    WGPUStoreOp_Store = 1,
    WGPUStoreOp_Discard = 2
} WGPUStoreOp;

typedef enum WGPUPrimitiveTopology {
    WGPUPrimitiveTopology_PointList = 0,
    WGPUPrimitiveTopology_LineList = 1,
    WGPUPrimitiveTopology_LineStrip = 2,
    WGPUPrimitiveTopology_TriangleList = 3,
    WGPUPrimitiveTopology_TriangleStrip = 4
} WGPUPrimitiveTopology;

typedef enum WGPUFrontFace {
    WGPUFrontFace_CCW = 0,
    WGPUFrontFace_CW = 1
} WGPUFrontFace;

typedef enum WGPUCullMode {
    WGPUCullMode_None = 0,
    WGPUCullMode_Front = 1,
    WGPUCullMode_Back = 2
} WGPUCullMode;

typedef enum WGPUIndexFormat {
    WGPUIndexFormat_Undefined = 0,
    WGPUIndexFormat_Uint16 = 1,
    WGPUIndexFormat_Uint32 = 2
} WGPUIndexFormat;

typedef enum WGPUCompositeAlphaMode {
    WGPUCompositeAlphaMode_Auto = 0,
    WGPUCompositeAlphaMode_Opaque = 1,
    WGPUCompositeAlphaMode_Premultiplied = 2
} WGPUCompositeAlphaMode;

typedef enum WGPUPresentMode {
    WGPUPresentMode_Undefined = 0,
    WGPUPresentMode_Fifo = 1,
    WGPUPresentMode_FifoRelaxed = 2,
    WGPUPresentMode_Immediate = 3,
    WGPUPresentMode_Mailbox = 4
} WGPUPresentMode;

/* Vertex attribute formats. Values are self-consistent header<->host (the host
   maps these ints to WGSL format strings). Values 1-9 are historical (kept for
   compatibility); 10+ append the rest of the WebGPU set. The NAME is the
   contract — these ints are NOT the canonical Dawn webgpu.h numbers. Full
   coverage: every WGPUVertexFormat the spec defines is mapped host-side. */
typedef enum WGPUVertexFormat {
    WGPUVertexFormat_Undefined  = 0,
    WGPUVertexFormat_Float32    = 1,
    WGPUVertexFormat_Float32x2  = 2,
    WGPUVertexFormat_Float32x3  = 3,
    WGPUVertexFormat_Float32x4  = 4,
    WGPUVertexFormat_Uint32     = 5,
    WGPUVertexFormat_Uint32x2   = 6,
    WGPUVertexFormat_Uint32x3   = 7,
    WGPUVertexFormat_Uint32x4   = 8,
    WGPUVertexFormat_Unorm8x4   = 9,
    /* --- appended: rest of the WebGPU vertex format set --- */
    WGPUVertexFormat_Uint8      = 10,
    WGPUVertexFormat_Uint8x2    = 11,
    WGPUVertexFormat_Uint8x4    = 12,
    WGPUVertexFormat_Sint8      = 13,
    WGPUVertexFormat_Sint8x2    = 14,
    WGPUVertexFormat_Sint8x4    = 15,
    WGPUVertexFormat_Unorm8     = 16,
    WGPUVertexFormat_Unorm8x2   = 17,
    WGPUVertexFormat_Snorm8     = 18,
    WGPUVertexFormat_Snorm8x2   = 19,
    WGPUVertexFormat_Snorm8x4   = 20,
    WGPUVertexFormat_Uint16     = 21,
    WGPUVertexFormat_Uint16x2   = 22,
    WGPUVertexFormat_Uint16x4   = 23,
    WGPUVertexFormat_Sint16     = 24,
    WGPUVertexFormat_Sint16x2   = 25,
    WGPUVertexFormat_Sint16x4   = 26,
    WGPUVertexFormat_Unorm16    = 27,
    WGPUVertexFormat_Unorm16x2  = 28,
    WGPUVertexFormat_Unorm16x4  = 29,
    WGPUVertexFormat_Snorm16    = 30,
    WGPUVertexFormat_Snorm16x2  = 31,
    WGPUVertexFormat_Snorm16x4  = 32,
    WGPUVertexFormat_Float16    = 33,
    WGPUVertexFormat_Float16x2  = 34,
    WGPUVertexFormat_Float16x4  = 35,
    WGPUVertexFormat_Sint32     = 36,
    WGPUVertexFormat_Sint32x2   = 37,
    WGPUVertexFormat_Sint32x3   = 38,
    WGPUVertexFormat_Sint32x4   = 39,
    WGPUVertexFormat_Unorm10_10_10_2 = 40,
    WGPUVertexFormat_Unorm8x4BGRA    = 41
} WGPUVertexFormat;

typedef enum WGPUVertexStepMode {
    WGPUVertexStepMode_Vertex   = 0,
    WGPUVertexStepMode_Instance = 1
} WGPUVertexStepMode;

/* Buffer usage flags. Values mirror the JS GPUBufferUsage bits exactly so they
   pass straight through to the host (no remap). */
#define WGPUBufferUsage_MapRead      0x0001
#define WGPUBufferUsage_MapWrite     0x0002
#define WGPUBufferUsage_CopySrc      0x0004
#define WGPUBufferUsage_CopyDst      0x0008
#define WGPUBufferUsage_Index        0x0010
#define WGPUBufferUsage_Vertex       0x0020
#define WGPUBufferUsage_Uniform      0x0040
#define WGPUBufferUsage_Storage      0x0080
#define WGPUBufferUsage_Indirect     0x0100
#define WGPUBufferUsage_QueryResolve 0x0200

/* Shader stage visibility flags (mirror JS GPUShaderStage). */
#define WGPUShaderStage_Vertex   0x1
#define WGPUShaderStage_Fragment 0x2
#define WGPUShaderStage_Compute  0x4

typedef enum WGPUBufferBindingType {
    WGPUBufferBindingType_Undefined        = 0,
    WGPUBufferBindingType_Uniform          = 1,
    WGPUBufferBindingType_Storage          = 2,
    WGPUBufferBindingType_ReadOnlyStorage  = 3
} WGPUBufferBindingType;

/* Texture usage flags. */
#define WGPUTextureUsage_CopySrc          0x01
#define WGPUTextureUsage_CopyDst          0x02
#define WGPUTextureUsage_TextureBinding   0x04
#define WGPUTextureUsage_StorageBinding   0x08
#define WGPUTextureUsage_RenderAttachment 0x10

/* Color write mask. */
#define WGPUColorWriteMask_None  0x0
#define WGPUColorWriteMask_Red   0x1
#define WGPUColorWriteMask_Green 0x2
#define WGPUColorWriteMask_Blue  0x4
#define WGPUColorWriteMask_Alpha 0x8
#define WGPUColorWriteMask_All   0xF

#define WGPU_DEPTH_SLICE_UNDEFINED 0xFFFFFFFF

/* ---- Chained struct base ---- */
typedef struct WGPUChainedStruct {
    const struct WGPUChainedStruct *next;
    WGPUSType sType;
} WGPUChainedStruct;

/* ---- Callbacks + callback-info ---- */
typedef void (*WGPURequestAdapterCallback)(WGPURequestAdapterStatus status,
    WGPUAdapter adapter, WGPUStringView message, void *userdata1, void *userdata2);
typedef void (*WGPURequestDeviceCallback)(WGPURequestDeviceStatus status,
    WGPUDevice device, WGPUStringView message, void *userdata1, void *userdata2);

typedef struct WGPURequestAdapterCallbackInfo {
    const WGPUChainedStruct *nextInChain;
    WGPUCallbackMode mode;
    WGPURequestAdapterCallback callback;
    void *userdata1;
    void *userdata2;
} WGPURequestAdapterCallbackInfo;

typedef struct WGPURequestDeviceCallbackInfo {
    const WGPUChainedStruct *nextInChain;
    WGPUCallbackMode mode;
    WGPURequestDeviceCallback callback;
    void *userdata1;
    void *userdata2;
} WGPURequestDeviceCallbackInfo;

/* ---- Descriptors ---- */
typedef struct WGPUInstanceDescriptor {
    const WGPUChainedStruct *nextInChain;
} WGPUInstanceDescriptor;

typedef struct WGPURequestAdapterOptions {
    const WGPUChainedStruct *nextInChain;
    WGPUSurface compatibleSurface;
    WGPUPowerPreference powerPreference;
    WGPUBool forceFallbackAdapter;
} WGPURequestAdapterOptions;

typedef struct WGPUDeviceDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
} WGPUDeviceDescriptor;

typedef struct WGPUSurfaceDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
} WGPUSurfaceDescriptor;

typedef struct WGPUSurfaceConfiguration {
    const WGPUChainedStruct *nextInChain;
    WGPUDevice device;
    WGPUTextureFormat format;
    WGPUFlags usage;
    uint32_t width;
    uint32_t height;
    size_t viewFormatCount;
    const WGPUTextureFormat *viewFormats;
    WGPUCompositeAlphaMode alphaMode;
    WGPUPresentMode presentMode;
} WGPUSurfaceConfiguration;

typedef enum WGPUSurfaceGetCurrentTextureStatus {
    WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal = 1,
    WGPUSurfaceGetCurrentTextureStatus_Error = 5
} WGPUSurfaceGetCurrentTextureStatus;

typedef struct WGPUSurfaceTexture {
    const WGPUChainedStruct *nextInChain;
    WGPUTexture texture;
    WGPUSurfaceGetCurrentTextureStatus status;
} WGPUSurfaceTexture;

typedef struct WGPUShaderSourceWGSL {
    WGPUChainedStruct chain;   /* chain.sType = WGPUSType_ShaderSourceWGSL */
    WGPUStringView code;
} WGPUShaderSourceWGSL;

typedef struct WGPUShaderModuleDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
} WGPUShaderModuleDescriptor;

/* WGPUTextureViewDescriptor is defined after the texture enums it references
   (WGPUTextureViewDimension / WGPUTextureAspect), below near WGPUSamplerDescriptor. */
typedef struct WGPUTextureViewDescriptor WGPUTextureViewDescriptor;

typedef enum WGPUBlendOperation {
    WGPUBlendOperation_Add = 1,
    WGPUBlendOperation_Subtract = 2,
    WGPUBlendOperation_ReverseSubtract = 3,
    WGPUBlendOperation_Min = 4,
    WGPUBlendOperation_Max = 5
} WGPUBlendOperation;

typedef enum WGPUBlendFactor {
    WGPUBlendFactor_Zero = 0,
    WGPUBlendFactor_One = 1,
    WGPUBlendFactor_Src = 2,
    WGPUBlendFactor_OneMinusSrc = 3,
    WGPUBlendFactor_SrcAlpha = 4,
    WGPUBlendFactor_OneMinusSrcAlpha = 5,
    WGPUBlendFactor_Dst = 6,
    WGPUBlendFactor_OneMinusDst = 7,
    WGPUBlendFactor_DstAlpha = 8,
    WGPUBlendFactor_OneMinusDstAlpha = 9
} WGPUBlendFactor;

typedef struct WGPUBlendComponent {
    WGPUBlendOperation operation;
    WGPUBlendFactor srcFactor;
    WGPUBlendFactor dstFactor;
} WGPUBlendComponent;

typedef struct WGPUBlendState {
    WGPUBlendComponent color;
    WGPUBlendComponent alpha;
} WGPUBlendState;

/* Pipeline-overridable constant (WGPUConstantEntry): a WGSL override keyed by
   its name (or numeric id as a string) set to a scalar double at pipeline
   creation. */
typedef struct WGPUConstantEntry {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView key;
    double value;
} WGPUConstantEntry;

typedef struct WGPUVertexAttribute {
    WGPUVertexFormat format;
    uint64_t offset;
    uint32_t shaderLocation;
} WGPUVertexAttribute;

typedef struct WGPUVertexBufferLayout {
    uint64_t arrayStride;
    WGPUVertexStepMode stepMode;
    size_t attributeCount;
    const WGPUVertexAttribute *attributes;
} WGPUVertexBufferLayout;

typedef struct WGPUBufferDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    WGPUFlags usage;
    uint64_t size;
    WGPUBool mappedAtCreation;
} WGPUBufferDescriptor;

/* ---- Bind groups / pipeline layout ---- */
typedef enum WGPUSamplerBindingType {
    WGPUSamplerBindingType_Undefined = 0,
    WGPUSamplerBindingType_Filtering = 1,
    WGPUSamplerBindingType_NonFiltering = 2,
    WGPUSamplerBindingType_Comparison = 3
} WGPUSamplerBindingType;

typedef enum WGPUTextureSampleType {
    WGPUTextureSampleType_Undefined = 0,
    WGPUTextureSampleType_Float = 1,
    WGPUTextureSampleType_UnfilterableFloat = 2,
    WGPUTextureSampleType_Depth = 3,
    WGPUTextureSampleType_Sint = 4,
    WGPUTextureSampleType_Uint = 5
} WGPUTextureSampleType;

typedef enum WGPUTextureViewDimension {
    WGPUTextureViewDimension_Undefined = 0,
    WGPUTextureViewDimension_1D = 1,
    WGPUTextureViewDimension_2D = 2,
    WGPUTextureViewDimension_2DArray = 3,
    WGPUTextureViewDimension_Cube = 4,
    WGPUTextureViewDimension_CubeArray = 5,
    WGPUTextureViewDimension_3D = 6
} WGPUTextureViewDimension;

typedef enum WGPUStorageTextureAccess {
    WGPUStorageTextureAccess_Undefined = 0,
    WGPUStorageTextureAccess_WriteOnly = 1,
    WGPUStorageTextureAccess_ReadOnly = 2,
    WGPUStorageTextureAccess_ReadWrite = 3
} WGPUStorageTextureAccess;

typedef struct WGPUBufferBindingLayout {
    const WGPUChainedStruct *nextInChain;
    WGPUBufferBindingType type;
    WGPUBool hasDynamicOffset;
    uint64_t minBindingSize;
} WGPUBufferBindingLayout;

typedef struct WGPUSamplerBindingLayout {
    const WGPUChainedStruct *nextInChain;
    WGPUSamplerBindingType type;
} WGPUSamplerBindingLayout;

typedef struct WGPUTextureBindingLayout {
    const WGPUChainedStruct *nextInChain;
    WGPUTextureSampleType sampleType;
    WGPUTextureViewDimension viewDimension;
    WGPUBool multisampled;
} WGPUTextureBindingLayout;

typedef struct WGPUStorageTextureBindingLayout {
    const WGPUChainedStruct *nextInChain;
    WGPUStorageTextureAccess access;
    WGPUTextureFormat format;
    WGPUTextureViewDimension viewDimension;
} WGPUStorageTextureBindingLayout;

typedef struct WGPUBindGroupLayoutEntry {
    const WGPUChainedStruct *nextInChain;
    uint32_t binding;
    WGPUFlags visibility;
    WGPUBufferBindingLayout buffer;
    WGPUSamplerBindingLayout sampler;
    WGPUTextureBindingLayout texture;
    WGPUStorageTextureBindingLayout storageTexture;
} WGPUBindGroupLayoutEntry;

typedef struct WGPUBindGroupLayoutDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    size_t entryCount;
    const WGPUBindGroupLayoutEntry *entries;
} WGPUBindGroupLayoutDescriptor;

typedef struct WGPUBindGroupEntry {
    const WGPUChainedStruct *nextInChain;
    uint32_t binding;
    WGPUBuffer buffer;
    uint64_t offset;
    uint64_t size;
    WGPUSampler sampler;
    WGPUTextureView textureView;
} WGPUBindGroupEntry;

typedef struct WGPUBindGroupDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    WGPUBindGroupLayout layout;
    size_t entryCount;
    const WGPUBindGroupEntry *entries;
} WGPUBindGroupDescriptor;

typedef struct WGPUPipelineLayoutDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    size_t bindGroupLayoutCount;
    const WGPUBindGroupLayout *bindGroupLayouts;
} WGPUPipelineLayoutDescriptor;

/* ---- Textures + samplers ---- */
typedef enum WGPUTextureDimension {
    WGPUTextureDimension_1D = 1,
    WGPUTextureDimension_2D = 2,
    WGPUTextureDimension_3D = 3
} WGPUTextureDimension;

typedef enum WGPUTextureAspect {
    WGPUTextureAspect_Undefined = 0,
    WGPUTextureAspect_All = 1,
    WGPUTextureAspect_StencilOnly = 2,
    WGPUTextureAspect_DepthOnly = 3
} WGPUTextureAspect;

typedef enum WGPUAddressMode {
    WGPUAddressMode_Undefined = 0,
    WGPUAddressMode_ClampToEdge = 1,
    WGPUAddressMode_Repeat = 2,
    WGPUAddressMode_MirrorRepeat = 3
} WGPUAddressMode;

typedef enum WGPUFilterMode {
    WGPUFilterMode_Undefined = 0,
    WGPUFilterMode_Nearest = 1,
    WGPUFilterMode_Linear = 2
} WGPUFilterMode;

typedef enum WGPUMipmapFilterMode {
    WGPUMipmapFilterMode_Undefined = 0,
    WGPUMipmapFilterMode_Nearest = 1,
    WGPUMipmapFilterMode_Linear = 2
} WGPUMipmapFilterMode;

typedef struct WGPUExtent3D {
    uint32_t width;
    uint32_t height;
    uint32_t depthOrArrayLayers;
} WGPUExtent3D;

typedef struct WGPUOrigin3D {
    uint32_t x;
    uint32_t y;
    uint32_t z;
} WGPUOrigin3D;

typedef struct WGPUTextureDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    WGPUFlags usage;
    WGPUTextureDimension dimension;
    WGPUExtent3D size;
    WGPUTextureFormat format;
    uint32_t mipLevelCount;
    uint32_t sampleCount;
    size_t viewFormatCount;
    const WGPUTextureFormat *viewFormats;
} WGPUTextureDescriptor;

typedef enum WGPUCompareFunction {
    WGPUCompareFunction_Undefined = 0,
    WGPUCompareFunction_Never = 1,
    WGPUCompareFunction_Less = 2,
    WGPUCompareFunction_Equal = 3,
    WGPUCompareFunction_LessEqual = 4,
    WGPUCompareFunction_Greater = 5,
    WGPUCompareFunction_NotEqual = 6,
    WGPUCompareFunction_GreaterEqual = 7,
    WGPUCompareFunction_Always = 8
} WGPUCompareFunction;

typedef struct WGPUSamplerDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    WGPUAddressMode addressModeU;
    WGPUAddressMode addressModeV;
    WGPUAddressMode addressModeW;
    WGPUFilterMode magFilter;
    WGPUFilterMode minFilter;
    WGPUMipmapFilterMode mipmapFilter;
    float lodMinClamp;
    float lodMaxClamp;
    WGPUCompareFunction compare;   /* 0 (Undefined) => not a comparison sampler */
    uint16_t maxAnisotropy;
} WGPUSamplerDescriptor;

/* Full texture-view descriptor (defined here, after WGPUTextureViewDimension /
   WGPUTextureAspect / WGPUTextureFormat). 0 fields mean "default": format 0 =
   the texture's format, dimension 0 = inferred, mipLevelCount/arrayLayerCount 0
   = remaining levels/layers. */
typedef struct WGPUTextureViewDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    WGPUTextureFormat format;
    WGPUTextureViewDimension dimension;
    uint32_t baseMipLevel;
    uint32_t mipLevelCount;
    uint32_t baseArrayLayer;
    uint32_t arrayLayerCount;
    WGPUTextureAspect aspect;
} WGPUTextureViewDescriptor;

/* Newer dialect spelling: WGPUTexelCopyTextureInfo / WGPUTexelCopyBufferLayout
   (formerly WGPUImageCopyTexture / WGPUTextureDataLayout). */
typedef struct WGPUTexelCopyTextureInfo {
    WGPUTexture texture;
    uint32_t mipLevel;
    WGPUOrigin3D origin;
    WGPUTextureAspect aspect;
} WGPUTexelCopyTextureInfo;

typedef struct WGPUTexelCopyBufferLayout {
    uint64_t offset;
    uint32_t bytesPerRow;
    uint32_t rowsPerImage;
} WGPUTexelCopyBufferLayout;

typedef struct WGPUTexelCopyBufferInfo {
    WGPUTexelCopyBufferLayout layout;
    WGPUBuffer buffer;
} WGPUTexelCopyBufferInfo;

/* ---- Buffer mapping / readback (async; callback-based, NO JSPI) ---- */
typedef WGPUFlags WGPUMapMode;
#define WGPUMapMode_None  0x0
#define WGPUMapMode_Read  0x1
#define WGPUMapMode_Write 0x2

typedef enum WGPUMapAsyncStatus {
    WGPUMapAsyncStatus_Success = 1,
    WGPUMapAsyncStatus_Error = 3,
    WGPUMapAsyncStatus_Aborted = 4
} WGPUMapAsyncStatus;

typedef void (*WGPUBufferMapCallback)(WGPUMapAsyncStatus status,
    WGPUStringView message, void *userdata1, void *userdata2);

typedef struct WGPUBufferMapCallbackInfo {
    const WGPUChainedStruct *nextInChain;
    WGPUCallbackMode mode;
    WGPUBufferMapCallback callback;
    void *userdata1;
    void *userdata2;
} WGPUBufferMapCallbackInfo;

/* ---- Error handling (push/pop error scope; callback-based, NO JSPI) ---- */
typedef enum WGPUErrorFilter {
    WGPUErrorFilter_Validation = 1,
    WGPUErrorFilter_OutOfMemory = 2,
    WGPUErrorFilter_Internal = 3
} WGPUErrorFilter;

typedef enum WGPUErrorType {
    WGPUErrorType_NoError = 1,
    WGPUErrorType_Validation = 2,
    WGPUErrorType_OutOfMemory = 3,
    WGPUErrorType_Internal = 4,
    WGPUErrorType_Unknown = 5
} WGPUErrorType;

typedef enum WGPUPopErrorScopeStatus {
    WGPUPopErrorScopeStatus_Success = 1,
    WGPUPopErrorScopeStatus_Error = 3
} WGPUPopErrorScopeStatus;

typedef void (*WGPUPopErrorScopeCallback)(WGPUPopErrorScopeStatus status,
    WGPUErrorType type, WGPUStringView message, void *userdata1, void *userdata2);

typedef struct WGPUPopErrorScopeCallbackInfo {
    const WGPUChainedStruct *nextInChain;
    WGPUCallbackMode mode;
    WGPUPopErrorScopeCallback callback;
    void *userdata1;
    void *userdata2;
} WGPUPopErrorScopeCallbackInfo;

typedef struct WGPUColorTargetState {
    const WGPUChainedStruct *nextInChain;
    WGPUTextureFormat format;
    const WGPUBlendState *blend;
    WGPUFlags writeMask;
} WGPUColorTargetState;

typedef struct WGPUVertexState {
    const WGPUChainedStruct *nextInChain;
    WGPUShaderModule module;
    WGPUStringView entryPoint;
    size_t constantCount;
    const WGPUConstantEntry *constants;
    size_t bufferCount;
    const WGPUVertexBufferLayout *buffers;
} WGPUVertexState;

typedef struct WGPUFragmentState {
    const WGPUChainedStruct *nextInChain;
    WGPUShaderModule module;
    WGPUStringView entryPoint;
    size_t constantCount;
    const WGPUConstantEntry *constants;
    size_t targetCount;
    const WGPUColorTargetState *targets;
} WGPUFragmentState;

typedef struct WGPUPrimitiveState {
    const WGPUChainedStruct *nextInChain;
    WGPUPrimitiveTopology topology;
    WGPUIndexFormat stripIndexFormat;
    WGPUFrontFace frontFace;
    WGPUCullMode cullMode;
} WGPUPrimitiveState;

typedef struct WGPUMultisampleState {
    const WGPUChainedStruct *nextInChain;
    uint32_t count;
    uint32_t mask;
    WGPUBool alphaToCoverageEnabled;
} WGPUMultisampleState;

typedef enum WGPUStencilOperation {
    WGPUStencilOperation_Keep = 1,
    WGPUStencilOperation_Zero = 2,
    WGPUStencilOperation_Replace = 3,
    WGPUStencilOperation_Invert = 4,
    WGPUStencilOperation_IncrementClamp = 5,
    WGPUStencilOperation_DecrementClamp = 6,
    WGPUStencilOperation_IncrementWrap = 7,
    WGPUStencilOperation_DecrementWrap = 8
} WGPUStencilOperation;

typedef struct WGPUStencilFaceState {
    WGPUCompareFunction compare;
    WGPUStencilOperation failOp;
    WGPUStencilOperation depthFailOp;
    WGPUStencilOperation passOp;
} WGPUStencilFaceState;

/* WGPUOptionalBool-style depthWriteEnabled in the modern dialect; we accept a
   plain WGPUBool (0/1) — 1 = write depth. */
typedef struct WGPUDepthStencilState {
    const WGPUChainedStruct *nextInChain;
    WGPUTextureFormat format;
    WGPUBool depthWriteEnabled;
    WGPUCompareFunction depthCompare;
    WGPUStencilFaceState stencilFront;
    WGPUStencilFaceState stencilBack;
    uint32_t stencilReadMask;
    uint32_t stencilWriteMask;
    int32_t depthBias;
    float depthBiasSlopeScale;
    float depthBiasClamp;
} WGPUDepthStencilState;

typedef struct WGPURenderPipelineDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    WGPUPipelineLayout layout;
    WGPUVertexState vertex;
    WGPUPrimitiveState primitive;
    const WGPUDepthStencilState *depthStencil;
    WGPUMultisampleState multisample;
    const WGPUFragmentState *fragment;
} WGPURenderPipelineDescriptor;

typedef struct WGPUCommandEncoderDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
} WGPUCommandEncoderDescriptor;

typedef struct WGPURenderPassDepthStencilAttachment {
    WGPUTextureView view;
    WGPULoadOp depthLoadOp;
    WGPUStoreOp depthStoreOp;
    float depthClearValue;
    WGPUBool depthReadOnly;
    WGPULoadOp stencilLoadOp;
    WGPUStoreOp stencilStoreOp;
    uint32_t stencilClearValue;
    WGPUBool stencilReadOnly;
} WGPURenderPassDepthStencilAttachment;

typedef struct WGPURenderPassColorAttachment {
    const WGPUChainedStruct *nextInChain;
    WGPUTextureView view;
    uint32_t depthSlice;
    WGPUTextureView resolveTarget;
    WGPULoadOp loadOp;
    WGPUStoreOp storeOp;
    WGPUColor clearValue;
} WGPURenderPassColorAttachment;

typedef struct WGPURenderPassDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    size_t colorAttachmentCount;
    const WGPURenderPassColorAttachment *colorAttachments;
    const WGPURenderPassDepthStencilAttachment *depthStencilAttachment;
} WGPURenderPassDescriptor;

typedef struct WGPUCommandBufferDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
} WGPUCommandBufferDescriptor;

/* ---- Compute ---- */
typedef struct WGPUComputeState {
    const WGPUChainedStruct *nextInChain;
    WGPUShaderModule module;
    WGPUStringView entryPoint;
    size_t constantCount;
    const WGPUConstantEntry *constants;
} WGPUComputeState;

typedef struct WGPUComputePipelineDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    WGPUPipelineLayout layout;
    WGPUComputeState compute;
} WGPUComputePipelineDescriptor;

typedef struct WGPUComputePassDescriptor {
    const WGPUChainedStruct *nextInChain;
    WGPUStringView label;
    const void *timestampWrites;   /* WGPUComputePassTimestampWrites*, ignored */
} WGPUComputePassDescriptor;

/* ---- Functions ---- */
WGPUInstance wgpuCreateInstance(const WGPUInstanceDescriptor *descriptor);
WGPUFuture wgpuInstanceRequestAdapter(WGPUInstance instance,
    const WGPURequestAdapterOptions *options, WGPURequestAdapterCallbackInfo callbackInfo);
WGPUSurface wgpuInstanceCreateSurface(WGPUInstance instance,
    const WGPUSurfaceDescriptor *descriptor);
WGPUFuture wgpuAdapterRequestDevice(WGPUAdapter adapter,
    const WGPUDeviceDescriptor *descriptor, WGPURequestDeviceCallbackInfo callbackInfo);
WGPUQueue wgpuDeviceGetQueue(WGPUDevice device);

WGPUTextureFormat wgpuSurfaceGetPreferredFormat(WGPUSurface surface, WGPUAdapter adapter);
void wgpuSurfaceConfigure(WGPUSurface surface, const WGPUSurfaceConfiguration *config);
void wgpuSurfaceGetCurrentTexture(WGPUSurface surface, WGPUSurfaceTexture *surfaceTexture);
void wgpuSurfacePresent(WGPUSurface surface);

WGPUTextureView wgpuTextureCreateView(WGPUTexture texture, const WGPUTextureViewDescriptor *descriptor);
WGPUShaderModule wgpuDeviceCreateShaderModule(WGPUDevice device, const WGPUShaderModuleDescriptor *descriptor);
WGPURenderPipeline wgpuDeviceCreateRenderPipeline(WGPUDevice device, const WGPURenderPipelineDescriptor *descriptor);
WGPUCommandEncoder wgpuDeviceCreateCommandEncoder(WGPUDevice device, const WGPUCommandEncoderDescriptor *descriptor);
WGPURenderPassEncoder wgpuCommandEncoderBeginRenderPass(WGPUCommandEncoder commandEncoder, const WGPURenderPassDescriptor *descriptor);
void wgpuRenderPassEncoderSetPipeline(WGPURenderPassEncoder renderPassEncoder, WGPURenderPipeline pipeline);
void wgpuRenderPassEncoderDraw(WGPURenderPassEncoder renderPassEncoder, uint32_t vertexCount, uint32_t instanceCount, uint32_t firstVertex, uint32_t firstInstance);
void wgpuRenderPassEncoderEnd(WGPURenderPassEncoder renderPassEncoder);
WGPUCommandBuffer wgpuCommandEncoderFinish(WGPUCommandEncoder commandEncoder, const WGPUCommandBufferDescriptor *descriptor);
void wgpuQueueSubmit(WGPUQueue queue, size_t commandCount, const WGPUCommandBuffer *commands);

/* Buffers (vertex/index/uniform). size/offset are bytes; the browser sandbox
   keeps these well under 2GB so they marshal as i32. */
WGPUBuffer wgpuDeviceCreateBuffer(WGPUDevice device, const WGPUBufferDescriptor *descriptor);
void wgpuQueueWriteBuffer(WGPUQueue queue, WGPUBuffer buffer, uint64_t bufferOffset, const void *data, size_t size);
void wgpuRenderPassEncoderSetVertexBuffer(WGPURenderPassEncoder renderPassEncoder, uint32_t slot, WGPUBuffer buffer, uint64_t offset, uint64_t size);
void wgpuRenderPassEncoderSetIndexBuffer(WGPURenderPassEncoder renderPassEncoder, WGPUBuffer buffer, WGPUIndexFormat format, uint64_t offset, uint64_t size);
void wgpuRenderPassEncoderDrawIndexed(WGPURenderPassEncoder renderPassEncoder, uint32_t indexCount, uint32_t instanceCount, uint32_t firstIndex, int32_t baseVertex, uint32_t firstInstance);
void wgpuRenderPassEncoderSetStencilReference(WGPURenderPassEncoder renderPassEncoder, uint32_t reference);

/* Bind groups + pipeline layout (uniform/storage buffer bindings; sampler &
   texture bindings land with the textures increment). */
WGPUBindGroupLayout wgpuDeviceCreateBindGroupLayout(WGPUDevice device, const WGPUBindGroupLayoutDescriptor *descriptor);
WGPUPipelineLayout wgpuDeviceCreatePipelineLayout(WGPUDevice device, const WGPUPipelineLayoutDescriptor *descriptor);
WGPUBindGroup wgpuDeviceCreateBindGroup(WGPUDevice device, const WGPUBindGroupDescriptor *descriptor);
void wgpuRenderPassEncoderSetBindGroup(WGPURenderPassEncoder renderPassEncoder, uint32_t groupIndex, WGPUBindGroup group, size_t dynamicOffsetCount, const uint32_t *dynamicOffsets);

/* Textures + samplers. */
WGPUTexture wgpuDeviceCreateTexture(WGPUDevice device, const WGPUTextureDescriptor *descriptor);
WGPUSampler wgpuDeviceCreateSampler(WGPUDevice device, const WGPUSamplerDescriptor *descriptor);
void wgpuQueueWriteTexture(WGPUQueue queue, const WGPUTexelCopyTextureInfo *destination, const void *data, size_t dataSize, const WGPUTexelCopyBufferLayout *dataLayout, const WGPUExtent3D *writeSize);

/* GPU->CPU readback: render/copy to a buffer, map it async, read the bytes.
   getMappedRange returns a wasm-side copy of the mapped GPU bytes (read path);
   unmap frees it. copyTextureToBuffer requires bytesPerRow %256 == 0. */
void wgpuCommandEncoderCopyTextureToBuffer(WGPUCommandEncoder commandEncoder, const WGPUTexelCopyTextureInfo *source, const WGPUTexelCopyBufferInfo *destination, const WGPUExtent3D *copySize);
WGPUFuture wgpuBufferMapAsync(WGPUBuffer buffer, WGPUMapMode mode, size_t offset, size_t size, WGPUBufferMapCallbackInfo callbackInfo);
void *wgpuBufferGetMappedRange(WGPUBuffer buffer, size_t offset, size_t size);
const void *wgpuBufferGetConstMappedRange(WGPUBuffer buffer, size_t offset, size_t size);
void wgpuBufferUnmap(WGPUBuffer buffer);

void wgpuCommandEncoderCopyBufferToBuffer(WGPUCommandEncoder commandEncoder, WGPUBuffer source, uint64_t sourceOffset, WGPUBuffer destination, uint64_t destinationOffset, uint64_t size);

/* Compute pipelines + passes. */
WGPUComputePipeline wgpuDeviceCreateComputePipeline(WGPUDevice device, const WGPUComputePipelineDescriptor *descriptor);
WGPUComputePassEncoder wgpuCommandEncoderBeginComputePass(WGPUCommandEncoder commandEncoder, const WGPUComputePassDescriptor *descriptor);
void wgpuComputePassEncoderSetPipeline(WGPUComputePassEncoder computePassEncoder, WGPUComputePipeline pipeline);
void wgpuComputePassEncoderSetBindGroup(WGPUComputePassEncoder computePassEncoder, uint32_t groupIndex, WGPUBindGroup group, size_t dynamicOffsetCount, const uint32_t *dynamicOffsets);
void wgpuComputePassEncoderDispatchWorkgroups(WGPUComputePassEncoder computePassEncoder, uint32_t workgroupCountX, uint32_t workgroupCountY, uint32_t workgroupCountZ);
void wgpuComputePassEncoderEnd(WGPUComputePassEncoder computePassEncoder);

/* Error scopes: bracket GPU work to catch validation/oom errors in C (the
   message is also logged host-side). pop is async (callback model, NO JSPI). */
void wgpuDevicePushErrorScope(WGPUDevice device, WGPUErrorFilter filter);
WGPUFuture wgpuDevicePopErrorScope(WGPUDevice device, WGPUPopErrorScopeCallbackInfo callbackInfo);

/* Release/reference: free or retain a host handle. */
void wgpuBufferRelease(WGPUBuffer v);
void wgpuComputePipelineRelease(WGPUComputePipeline v);
void wgpuComputePassEncoderRelease(WGPUComputePassEncoder v);
void wgpuBindGroupLayoutRelease(WGPUBindGroupLayout v);
void wgpuBindGroupRelease(WGPUBindGroup v);
void wgpuPipelineLayoutRelease(WGPUPipelineLayout v);
void wgpuSamplerRelease(WGPUSampler v);
void wgpuInstanceRelease(WGPUInstance v);
void wgpuAdapterRelease(WGPUAdapter v);
void wgpuDeviceRelease(WGPUDevice v);
void wgpuQueueRelease(WGPUQueue v);
void wgpuSurfaceRelease(WGPUSurface v);
void wgpuTextureRelease(WGPUTexture v);
void wgpuTextureViewRelease(WGPUTextureView v);
void wgpuShaderModuleRelease(WGPUShaderModule v);
void wgpuRenderPipelineRelease(WGPURenderPipeline v);
void wgpuCommandEncoderRelease(WGPUCommandEncoder v);
void wgpuRenderPassEncoderRelease(WGPURenderPassEncoder v);
void wgpuCommandBufferRelease(WGPUCommandBuffer v);

/* Frame loop (shared rAF; NO JSPI). Register a callback; it is called once per
   animation frame. Pass NULL to stop. Works with or without SDL. */
void wgpuSetMainLoopCallback(void (*callback)(void));

  `,
  "SDL_popup.h": `
#pragma once
/* Stock SDL3 popup windows + display bounds (todos/0256, the menu-uniform
   architecture's kernel anchored-child primitive). A subsidiary header on
   the sdl3webgpu.h precedent: the API is bone-stock SDL3 (in upstream it
   sits in SDL_video.h), but gucOS links veneer TUs whole, so the popup
   implementation and its two host imports live in their own TU — a binary
   that never creates popups keeps a byte-identical import table. */
#include <SDL.h>
__require_source("__SDL_popup.c");

/* A borderless child window anchored to the parent at (offset_x, offset_y)
   in parent client coordinates. Under the OS WM this is a kernel anchored
   child surface: moved/hidden/raised/destroyed/scaled with its parent
   (arbitrary nesting depth — a popup may parent another popup), never
   focused, clamped into the screen. Flags must include SDL_WINDOW_POPUP_MENU
   (holds the kernel grab while it lives: a press outside the popup's window
   tree dismisses it via SDL_EVENT_WINDOW_CLOSE_REQUESTED and the press is
   consumed) or SDL_WINDOW_TOOLTIP (no grab). Standalone runtimes have no
   window system for popups and return NULL. */
SDL_Window *SDL_CreatePopupWindow(SDL_Window *parent, int offset_x, int offset_y,
                                  int w, int h, SDL_WindowFlags flags);

/* Display bounds: the OS screen dims, origin always 0,0; displayID is
   ignored (one synthetic display). False where no window system exists. */
bool SDL_GetDisplayBounds(Uint32 displayID, SDL_Rect *rect);

  `,
  "__SDL_internal.h": `
#pragma once
/* __SDL.c's private window record + registry, shared with the popup TU
   (__SDL_popup.c, todos/0256). NOT for app code — the public headers keep
   SDL_Window opaque. 'handle' is a 1-based index into the host's window
   table, reused as the SDL window ID; the registry array lets
   __sdl_push_window_event re-derive a window's surface on RESIZED — popup
   windows slot into it directly (the register/unregister helpers stay
   static in __SDL.c: a cross-TU reference would defeat their single-use
   inlining and change every SDL binary's bytes). */
#include <SDL.h>

struct SDL_Window {
    int handle;
    SDL_Surface surface;
    int pixels_cap;      /* high-water byte size of surface.pixels (resize) */
    bool relative_mouse; /* requested relative-mouse mode (todos/0018) */
};

#define __SDL_MAX_WINDOWS 32
extern SDL_Window *__sdl_window_registry[__SDL_MAX_WINDOWS];

  `,
  "sdl3webgpu.h": `
#pragma once
/* SDL3 + WebGPU bridge (the eliemichel/sdl3webgpu precedent). Get a WGPUSurface
   for an SDL window. On this web backend the SDL window and the WebGPU surface
   are the SAME canvas, so this just creates the surface from it — but the call
   shape matches native sdl3webgpu so its examples port unchanged. Requires the
   SDL window NOT to have presented via SDL_UpdateWindowSurface (a canvas yields
   one context type for its lifetime): use either the software path OR WebGPU. */
#include <SDL.h>
#include <webgpu.h>
__require_source("__sdl3webgpu.c");

WGPUSurface SDL_GetWGPUSurface(WGPUInstance instance, SDL_Window *window);

  `,
  "__atexit.h": `
#pragma once
__require_source("__atexit.c");
int atexit(void (*func)(void));
void __run_atexits(void);
  `,
  "__malloc.h": `
#pragma once
#include <stddef.h>
__require_source("__malloc.c");

void *malloc(size_t size);
void free(void *ptr);
void *calloc(size_t count, size_t size);
void *realloc(void *ptr, size_t new_size);
void *aligned_alloc(size_t alignment, size_t size);

struct __heap_info {
  long heap_start;
  long heap_end;
  long total_bytes;
  long free_blocks;
  long free_bytes;
  long largest_free;
};
void __inspect_heap(struct __heap_info *info);
  `,
  "alloca.h": `
#pragma once
void *alloca(long size);
  `,
  "assert.h": `
__require_source("__assert.c");
void __assert_fail(const char *expr, const char *file, int line);
#ifdef NDEBUG
#define assert(expr) ((void)0)
#else
#define assert(expr) ((expr) ? (void)0 : __assert_fail(#expr, __FILE__, __LINE__))
#endif
#define static_assert _Static_assert
  `,
  "ctype.h": `
#pragma once
__require_source("__ctype.c");
int isalnum(int c);
int isalpha(int c);
int isblank(int c);
int iscntrl(int c);
int isdigit(int c);
int isgraph(int c);
int islower(int c);
int isprint(int c);
int ispunct(int c);
int isspace(int c);
int isupper(int c);
int isxdigit(int c);
int tolower(int c);
int toupper(int c);
  `,
  "wctype.h": `
#pragma once
__require_source("__wchar.c");
typedef unsigned int wint_t;
typedef int wctrans_t;
typedef int wctype_t;
#define WEOF ((wint_t)-1)
int iswalnum(wint_t c);
int iswalpha(wint_t c);
int iswblank(wint_t c);
int iswcntrl(wint_t c);
int iswdigit(wint_t c);
int iswgraph(wint_t c);
int iswlower(wint_t c);
int iswprint(wint_t c);
int iswpunct(wint_t c);
int iswspace(wint_t c);
int iswupper(wint_t c);
int iswxdigit(wint_t c);
wint_t towlower(wint_t c);
wint_t towupper(wint_t c);
/* Character-class lookup/test (C95). wctype(name) maps a POSIX class name
   ("alpha", "digit", "space", ...) to an opaque handle; iswctype(c, handle)
   tests c against it. Used by POSIX regex bracket classes ([[:alpha:]]). */
wctype_t wctype(const char *name);
int iswctype(wint_t c, wctype_t type);
  `,
  "wchar.h": `
#pragma once
#include <stddef.h>
#include <wctype.h>
__require_source("__wchar.c");
__require_source("__stdlib.c");  /* mbrtowc/wcrtomb use its shared UTF-8 codec */
typedef struct { int __state; } mbstate_t;
size_t wcslen(const wchar_t *s);
wchar_t *wcscpy(wchar_t *dest, const wchar_t *src);
wchar_t *wcsncpy(wchar_t *dest, const wchar_t *src, size_t n);
int wcscmp(const wchar_t *s1, const wchar_t *s2);
int wcsncmp(const wchar_t *s1, const wchar_t *s2, size_t n);
wchar_t *wcscat(wchar_t *dest, const wchar_t *src);
wchar_t *wcsncat(wchar_t *dest, const wchar_t *src, size_t n);
wchar_t *wcschr(const wchar_t *s, wchar_t c);
wchar_t *wcsrchr(const wchar_t *s, wchar_t c);
wchar_t *wcsstr(const wchar_t *haystack, const wchar_t *needle);
size_t wcsspn(const wchar_t *s, const wchar_t *accept);
size_t wcscspn(const wchar_t *s, const wchar_t *reject);
wchar_t *wcspbrk(const wchar_t *s, const wchar_t *accept);
wchar_t *wcstok(wchar_t *str, const wchar_t *delim, wchar_t **saveptr);
int wcscoll(const wchar_t *s1, const wchar_t *s2);
size_t wcsxfrm(wchar_t *dest, const wchar_t *src, size_t n);
wchar_t *wmemcpy(wchar_t *dest, const wchar_t *src, size_t n);
wchar_t *wmemmove(wchar_t *dest, const wchar_t *src, size_t n);
wchar_t *wmemset(wchar_t *dest, wchar_t c, size_t n);
int wmemcmp(const wchar_t *s1, const wchar_t *s2, size_t n);
wchar_t *wmemchr(const wchar_t *s, wchar_t c, size_t n);
wint_t btowc(int c);
int wctob(wint_t c);
int mbsinit(const mbstate_t *ps);
size_t wcrtomb(char *s, wchar_t wc, mbstate_t *ps);
size_t mbrtowc(wchar_t *pwc, const char *s, size_t n, mbstate_t *ps);
  `,
  "sys/time.h": `
#pragma once
#include <time.h>
struct timeval {
  time_t tv_sec;   /* 64-bit (matches struct stat's st_*tim); range past 2038 */
  long tv_usec;
};
__import int __gettimeofday(long long *sec, long *usec);
/* Host primitives that actually set a file's access/modification times
   (whole seconds). Faithful on the Node and BlockFS backends; the OPFS
   backend has no timestamp API and treats them as existence-checked no-ops. */
__import int __utime(const char *path, long long atime, long long mtime);
__import int __futime(int fd, long long atime, long long mtime);
static inline int gettimeofday(struct timeval *tv, void *tz) {
  (void)tz;
  if (tv) {
    __gettimeofday(&tv->tv_sec, &tv->tv_usec);
  }
  return 0;
}
/* utimes()/futimes(): set access+modification times. A NULL \`times\` means
   "now". POSIX timeval is microsecond-resolution, but this environment's
   filesystems store whole-second times, so the sub-second part is truncated
   (POSIX permits coarser filesystem granularity). Errors (e.g. ENOENT for a
   missing path) come back through errno from the host. */
static inline int utimes(const char *path, const struct timeval times[2]) {
  time_t a, m;
  if (times == 0) { struct timeval now; gettimeofday(&now, 0); a = m = now.tv_sec; }
  else { a = times[0].tv_sec; m = times[1].tv_sec; }
  return __utime(path, a, m);
}
static inline int futimes(int fd, const struct timeval times[2]) {
  time_t a, m;
  if (times == 0) { struct timeval now; gettimeofday(&now, 0); a = m = now.tv_sec; }
  else { a = times[0].tv_sec; m = times[1].tv_sec; }
  return __futime(fd, a, m);
}
/* ---- interval timers (todos/0044) ----
   ONE kernel-side real-time timer per process; expiry posts SIGALRM through
   the ordinary cooperative signal path (safe points — the settled 0001
   caveat applies). ITIMER_VIRTUAL/PROF fail with EINVAL: workers run on
   their own OS threads, so there is no CPU accounting to back them.
   Millisecond resolution (sub-ms rounds UP so a tiny-but-armed timer never
   silently becomes "disarmed"). Implementations live in __signal.c, which
   links into every stdlib program via abort(). */
#define ITIMER_REAL    0
#define ITIMER_VIRTUAL 1
#define ITIMER_PROF    2
struct itimerval {
  struct timeval it_interval;   /* reload value; zero = one-shot */
  struct timeval it_value;      /* time to expiry; zero = disarmed */
};
int setitimer(int __which, const struct itimerval *__nv, struct itimerval *__ov);
int getitimer(int __which, struct itimerval *__cur);
#include <sys/select.h>  // glibc-style: fd_set / FD_* live here under _GNU_SOURCE
  `,
  "sys/file.h": `
#pragma once
  `,
  "sys/select.h": `
#pragma once
#include <sys/time.h>

#define FD_SETSIZE 64

typedef struct {
  unsigned long fds_bits[FD_SETSIZE / (8 * sizeof(unsigned long))];
} fd_set;

#define FD_ZERO(set)  do { for (int _i = 0; _i < (int)(sizeof((set)->fds_bits)/sizeof((set)->fds_bits[0])); _i++) (set)->fds_bits[_i] = 0; } while(0)
#define FD_SET(fd, set)   ((set)->fds_bits[(fd) / (8 * sizeof(unsigned long))] |= (1UL << ((fd) % (8 * sizeof(unsigned long)))))
#define FD_CLR(fd, set)   ((set)->fds_bits[(fd) / (8 * sizeof(unsigned long))] &= ~(1UL << ((fd) % (8 * sizeof(unsigned long)))))
#define FD_ISSET(fd, set) ((set)->fds_bits[(fd) / (8 * sizeof(unsigned long))] & (1UL << ((fd) % (8 * sizeof(unsigned long)))))

__import int __select_impl(int nfds, int *readfds, int *writefds, int *exceptfds, long timeout_sec, long timeout_usec, int has_timeout);

static inline int select(int nfds, fd_set *readfds, fd_set *writefds, fd_set *exceptfds, struct timeval *timeout) {
  return __select_impl(nfds,
    readfds ? (int *)readfds->fds_bits : (int *)0,
    writefds ? (int *)writefds->fds_bits : (int *)0,
    exceptfds ? (int *)exceptfds->fds_bits : (int *)0,
    timeout ? timeout->tv_sec : 0,
    timeout ? timeout->tv_usec : 0,
    timeout ? 1 : 0);
}
  `,
  "sys/socket.h": `
#pragma once
/* AF_UNIX stream sockets over the kernel's pipe machinery (todos/0008).
   Only AF_UNIX + SOCK_STREAM is implemented — AF_INET needs a network relay
   and is a separate future item. The sockaddr surface is POSIX; the host
   imports speak plain fs paths (the only address family there is). The
   other families/types are defined so ports compile; using them fails at
   runtime with EAFNOSUPPORT/EPROTONOSUPPORT.
   v1 limits: SOCK_NONBLOCK/O_NONBLOCK are accepted but ignored (all socket
   I/O is blocking); MSG_NOSIGNAL is accepted but SIGPIPE still fires;
   setsockopt is accepted and ignored; the abstract namespace (sun_path
   starting with NUL) is EOPNOTSUPP. */
#include <stddef.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>

typedef unsigned socklen_t;
typedef unsigned short sa_family_t;

struct sockaddr { sa_family_t sa_family; char sa_data[14]; };
struct sockaddr_storage { sa_family_t ss_family; char __ss_pad[126]; };

#define AF_UNSPEC 0
#define AF_UNIX   1
#define AF_LOCAL  AF_UNIX
#define AF_INET   2
#define AF_INET6  10
#define PF_UNSPEC AF_UNSPEC
#define PF_UNIX   AF_UNIX
#define PF_LOCAL  AF_LOCAL
#define PF_INET   AF_INET

#define SOCK_STREAM    1
#define SOCK_DGRAM     2
#define SOCK_SEQPACKET 5
#define SOCK_CLOEXEC  0x80000  /* == O_CLOEXEC; moot (no exec-style fd leak) */
#define SOCK_NONBLOCK 0x800    /* == O_NONBLOCK; accepted, ignored (v1) */

#define SHUT_RD   0
#define SHUT_WR   1
#define SHUT_RDWR 2

#define MSG_PEEK     2
#define MSG_DONTWAIT 0x40
#define MSG_NOSIGNAL 0x4000

#define SOL_SOCKET   1
#define SO_REUSEADDR 2
#define SO_ERROR     4
#define SO_SNDBUF    7
#define SO_RCVBUF    8
#define SO_KEEPALIVE 9

__import int __sock_socket(int domain, int type, int protocol);
__import int __sock_bind(int fd, const char *path);
__import int __sock_listen(int fd, int backlog);
__import int __sock_accept(int fd);
__import int __sock_connect(int fd, const char *path);
__import int __sock_pair(int sv[2]);
__import int __sock_shutdown(int fd, int how);

/* Extract the NUL-terminated fs path from a sockaddr_un-shaped address
   (family at offset 0, path bytes right after — see <sys/un.h>). */
static inline int __sockaddr_un_path(const struct sockaddr *addr, socklen_t len,
                                     char *out /* [109] */) {
  if (!addr || len < (socklen_t)sizeof(sa_family_t)) { errno = EINVAL; return -1; }
  if (addr->sa_family != AF_UNIX) { errno = EAFNOSUPPORT; return -1; }
  {
    const char *p = (const char *)addr + sizeof(sa_family_t);
    socklen_t max = len - (socklen_t)sizeof(sa_family_t);
    socklen_t n = 0;
    if (max > 108) max = 108;
    while (n < max && p[n]) n++;
    if (n == 0) { errno = EINVAL; return -1; }          /* unnamed */
    if (p[0] == 0) { errno = EOPNOTSUPP; return -1; }   /* abstract ns */
    memcpy(out, p, n);
    out[n] = 0;
  }
  return 0;
}

static inline int socket(int domain, int type, int protocol) {
  type &= ~(SOCK_CLOEXEC | SOCK_NONBLOCK);
  if (domain != AF_UNIX) { errno = EAFNOSUPPORT; return -1; }
  if (type != SOCK_STREAM || protocol != 0) { errno = EPROTONOSUPPORT; return -1; }
  return __sock_socket(domain, type, protocol);
}
static inline int socketpair(int domain, int type, int protocol, int sv[2]) {
  type &= ~(SOCK_CLOEXEC | SOCK_NONBLOCK);
  if (domain != AF_UNIX) { errno = EAFNOSUPPORT; return -1; }
  if (type != SOCK_STREAM || protocol != 0) { errno = EPROTONOSUPPORT; return -1; }
  return __sock_pair(sv);
}
static inline int bind(int fd, const struct sockaddr *addr, socklen_t len) {
  char __p[109];
  if (__sockaddr_un_path(addr, len, __p) < 0) return -1;
  return __sock_bind(fd, __p);
}
static inline int connect(int fd, const struct sockaddr *addr, socklen_t len) {
  char __p[109];
  if (__sockaddr_un_path(addr, len, __p) < 0) return -1;
  return __sock_connect(fd, __p);
}
static inline int listen(int fd, int backlog) { return __sock_listen(fd, backlog); }
static inline int accept(int fd, struct sockaddr *addr, socklen_t *len) {
  int nfd = __sock_accept(fd);
  if (nfd >= 0 && addr && len) {          /* the peer is an unnamed AF_UNIX addr */
    if (*len >= (socklen_t)sizeof(sa_family_t)) addr->sa_family = AF_UNIX;
    *len = (socklen_t)sizeof(sa_family_t);
  }
  return nfd;
}
static inline int shutdown(int fd, int how) { return __sock_shutdown(fd, how); }
static inline long send(int fd, const void *buf, size_t n, int flags) {
  if (flags & ~MSG_NOSIGNAL) { errno = EOPNOTSUPP; return -1; }
  return write(fd, buf, n);
}
static inline long recv(int fd, void *buf, size_t n, int flags) {
  if (flags) { errno = EOPNOTSUPP; return -1; }
  return read(fd, buf, n);
}
static inline long sendto(int fd, const void *buf, size_t n, int flags,
                          const struct sockaddr *addr, socklen_t len) {
  if (addr || len) { errno = EISCONN; return -1; }  /* stream: no per-msg dest */
  return send(fd, buf, n, flags);
}
static inline long recvfrom(int fd, void *buf, size_t n, int flags,
                            struct sockaddr *addr, socklen_t *len) {
  if (len) *len = 0;
  return recv(fd, buf, n, flags);
}
static inline int setsockopt(int fd, int level, int opt, const void *v, socklen_t l) {
  (void)fd; (void)level; (void)opt; (void)v; (void)l;
  return 0;                               /* accepted and ignored */
}
static inline int getsockopt(int fd, int level, int opt, void *v, socklen_t *l) {
  (void)fd; (void)level; (void)opt;
  if (v && l && *l >= (socklen_t)sizeof(int)) { *(int *)v = 0; *l = sizeof(int); }
  return 0;                               /* everything reads back 0 (incl. SO_ERROR) */
}
static inline int getsockname(int fd, struct sockaddr *addr, socklen_t *len) {
  (void)fd;
  if (addr && len && *len >= (socklen_t)sizeof(sa_family_t)) {
    addr->sa_family = AF_UNIX;
    *len = (socklen_t)sizeof(sa_family_t);
  }
  return 0;
}
static inline int getpeername(int fd, struct sockaddr *addr, socklen_t *len) {
  return getsockname(fd, addr, len);
}
  `,
  "sys/un.h": `
#pragma once
#include <sys/socket.h>
#include <string.h>
struct sockaddr_un {
  sa_family_t sun_family;
  char sun_path[108];
};
#define SUN_LEN(su) ((socklen_t)(sizeof(sa_family_t) + strlen((su)->sun_path)))
  `,
  "byteswap.h": `
#pragma once
static inline unsigned short bswap_16(unsigned short x) {
  return (x >> 8) | (x << 8);
}
static inline unsigned int bswap_32(unsigned int x) {
  return (x >> 24) | ((x >> 8) & 0xFF00) | ((x << 8) & 0xFF0000) | (x << 24);
}
static inline unsigned long long bswap_64(unsigned long long x) {
  return ((x >> 56) & 0xFF) | ((x >> 40) & 0xFF00) |
         ((x >> 24) & 0xFF0000) | ((x >> 8) & 0xFF000000ULL) |
         ((x << 8) & 0xFF00000000ULL) | ((x << 24) & 0xFF0000000000ULL) |
         ((x << 40) & 0xFF000000000000ULL) | ((x << 56) & 0xFF00000000000000ULL);
}
  `,
  "endian.h": `
#pragma once
#include <stdint.h>
#include <byteswap.h>
/* wasm is always little-endian. */
#define __LITTLE_ENDIAN 1234
#define __BIG_ENDIAN    4321
#define __PDP_ENDIAN    3412
#define __BYTE_ORDER    __LITTLE_ENDIAN
#define __FLOAT_WORD_ORDER __BYTE_ORDER
/* BSD-style unprefixed aliases (glibc exposes these under _GNU_SOURCE/_BSD_SOURCE). */
#define LITTLE_ENDIAN __LITTLE_ENDIAN
#define BIG_ENDIAN    __BIG_ENDIAN
#define PDP_ENDIAN    __PDP_ENDIAN
#define BYTE_ORDER    __BYTE_ORDER
static inline uint16_t htole16(uint16_t x) { return x; }
static inline uint16_t le16toh(uint16_t x) { return x; }
static inline uint32_t htole32(uint32_t x) { return x; }
static inline uint32_t le32toh(uint32_t x) { return x; }
static inline uint64_t htole64(uint64_t x) { return x; }
static inline uint64_t le64toh(uint64_t x) { return x; }
static inline uint16_t htobe16(uint16_t x) { return bswap_16(x); }
static inline uint16_t be16toh(uint16_t x) { return bswap_16(x); }
static inline uint32_t htobe32(uint32_t x) { return bswap_32(x); }
static inline uint32_t be32toh(uint32_t x) { return bswap_32(x); }
static inline uint64_t htobe64(uint64_t x) { return bswap_64(x); }
static inline uint64_t be64toh(uint64_t x) { return bswap_64(x); }
  `,
  "libgen.h": `
#pragma once
/* POSIX basename()/dirname(). Both may modify the input buffer and return a
   pointer into it (or a pointer to a static string for the "." / "/" cases).
   Like glibc's <libgen.h> variants, the static-string returns are shared, so
   these are not thread-safe and the result of one call may be clobbered by the
   next on the "." / "/" paths. */
static inline char *__libgen_last_slash(char *s) {
  char *last = 0;
  for (char *p = s; *p; p++) if (*p == '/') last = p;
  return last;
}
static inline char *basename(char *path) {
  static char dot[] = ".";
  static char root[] = "/";
  if (path == 0 || path[0] == 0) return dot;
  char *end = path;
  while (*end) end++;
  while (end > path && end[-1] == '/') *--end = 0;   /* strip trailing slashes */
  if (end == path) return root;                       /* path was all slashes */
  char *slash = __libgen_last_slash(path);
  return slash ? slash + 1 : path;
}
static inline char *dirname(char *path) {
  static char dot[] = ".";
  static char root[] = "/";
  if (path == 0 || path[0] == 0) return dot;
  char *end = path;
  while (*end) end++;
  while (end > path && end[-1] == '/') *--end = 0;   /* strip trailing slashes */
  if (end == path) return root;                       /* path was all slashes */
  char *slash = __libgen_last_slash(path);
  if (slash == 0) return dot;                         /* no directory component */
  while (slash > path && slash[-1] == '/') slash--;   /* strip dir's trailing slashes */
  if (slash == path) return root;                     /* directory is the root */
  *slash = 0;
  return path;
}
  `,
  "sys/utsname.h": `
#pragma once
#include <string.h>
struct utsname {
  char sysname[65];
  char nodename[65];
  char release[65];
  char version[65];
  char machine[65];
};
/* Fixed identity for the wasm runtime (no real kernel to query). */
static inline int uname(struct utsname *buf) {
  if (buf == 0) return -1;
  strcpy(buf->sysname,  "wasm");
  strcpy(buf->nodename, "localhost");
  strcpy(buf->release,  "1.0.0");
  strcpy(buf->version,  "c-compiler");
  strcpy(buf->machine,  "wasm32");
  return 0;
}
  `,
  "sys/resource.h": `
#pragma once
#include <sys/types.h>
#include <sys/time.h>
typedef unsigned long long rlim_t;
#define RLIM_INFINITY  (~0ULL)
#define RLIM_SAVED_MAX RLIM_INFINITY
#define RLIM_SAVED_CUR RLIM_INFINITY
#define RLIMIT_CPU     0
#define RLIMIT_FSIZE   1
#define RLIMIT_DATA    2
#define RLIMIT_STACK   3
#define RLIMIT_CORE    4
#define RLIMIT_RSS     5
#define RLIMIT_NPROC   6
#define RLIMIT_NOFILE  7
#define RLIMIT_MEMLOCK 8
#define RLIMIT_AS      9
#define RLIM_NLIMITS   10
struct rlimit { rlim_t rlim_cur; rlim_t rlim_max; };
/* No resource limits are enforced in this runtime: report "unlimited" and
   accept any setrlimit as a no-op. */
static inline int getrlimit(int resource, struct rlimit *rlim) {
  (void)resource;
  if (rlim) { rlim->rlim_cur = RLIM_INFINITY; rlim->rlim_max = RLIM_INFINITY; }
  return 0;
}
static inline int setrlimit(int resource, const struct rlimit *rlim) {
  (void)resource; (void)rlim;
  return 0;
}
#define RUSAGE_SELF     0
#define RUSAGE_CHILDREN (-1)
struct rusage {
  struct timeval ru_utime;
  struct timeval ru_stime;
  long ru_maxrss; long ru_ixrss; long ru_idrss; long ru_isrss;
  long ru_minflt; long ru_majflt; long ru_nswap;
  long ru_inblock; long ru_oublock;
  long ru_msgsnd; long ru_msgrcv; long ru_nsignals;
  long ru_nvcsw; long ru_nivcsw;
};
/* Resource usage isn't tracked: zero everything. */
static inline int getrusage(int who, struct rusage *usage) {
  (void)who;
  if (usage) { char *p = (char *)usage; for (unsigned long i = 0; i < sizeof(*usage); i++) p[i] = 0; }
  return 0;
}
  `,
  "sys/statvfs.h": `
#pragma once
#include <sys/types.h>
typedef unsigned long long fsblkcnt_t;
typedef unsigned long long fsfilcnt_t;
struct statvfs {
  unsigned long f_bsize;
  unsigned long f_frsize;
  fsblkcnt_t    f_blocks;
  fsblkcnt_t    f_bfree;
  fsblkcnt_t    f_bavail;
  fsfilcnt_t    f_files;
  fsfilcnt_t    f_ffree;
  fsfilcnt_t    f_favail;
  unsigned long f_fsid;
  unsigned long f_flag;
  unsigned long f_namemax;
};
#define ST_RDONLY 1
#define ST_NOSUID 2
/* Nominal values only — this runtime exposes no real filesystem geometry to C
   (callers like df() see a fixed 4 GiB volume). A BlockFS-backed statvfs that
   reports real free/used blocks is a TODO (needs a host import). */
static inline int statvfs(const char *path, struct statvfs *buf) {
  (void)path;
  if (buf == 0) return -1;
  buf->f_bsize = 4096; buf->f_frsize = 4096;
  buf->f_blocks = 1048576; buf->f_bfree = 1048576; buf->f_bavail = 1048576;
  buf->f_files = 65536; buf->f_ffree = 65536; buf->f_favail = 65536;
  buf->f_fsid = 0; buf->f_flag = 0; buf->f_namemax = 255;
  return 0;
}
static inline int fstatvfs(int fd, struct statvfs *buf) {
  (void)fd;
  return statvfs((const char *)0, buf);
}
  `,
  "sys/mman.h": `
#pragma once
#include <stddef.h>
#include <stdlib.h>
#include <errno.h>
#define PROT_NONE  0x0
#define PROT_READ  0x1
#define PROT_WRITE 0x2
#define PROT_EXEC  0x4
#define MAP_SHARED    0x01
#define MAP_PRIVATE   0x02
#define MAP_FIXED     0x10
#define MAP_ANONYMOUS 0x20
#define MAP_ANON      MAP_ANONYMOUS
#define MAP_FAILED    ((void *)-1)
#define MS_ASYNC      1
#define MS_SYNC       4
#define MS_INVALIDATE 2
/* Anonymous private mappings only, backed by calloc(). File-backed mmap
   (fd >= 0 without MAP_ANONYMOUS) is unsupported and fails with ENODEV.
   munmap() frees the whole region returned by mmap(); partial unmap is not
   supported. mprotect()/msync() are accepted no-ops. */
static inline void *mmap(void *addr, size_t length, int prot, int flags, int fd, long offset) {
  (void)addr; (void)prot; (void)offset;
  if (!(flags & MAP_ANONYMOUS) && fd >= 0) { errno = ENODEV; return MAP_FAILED; }
  if (length == 0) { errno = EINVAL; return MAP_FAILED; }
  void *p = calloc(1, length);
  if (p == 0) { errno = ENOMEM; return MAP_FAILED; }
  return p;
}
static inline int munmap(void *addr, size_t length) {
  (void)length;
  if (addr && addr != MAP_FAILED) free(addr);
  return 0;
}
static inline int mprotect(void *addr, size_t len, int prot) { (void)addr; (void)len; (void)prot; return 0; }
static inline int msync(void *addr, size_t len, int flags) { (void)addr; (void)len; (void)flags; return 0; }
  `,
  "poll.h": `
#pragma once
#include <sys/select.h>
typedef unsigned long nfds_t;
struct pollfd {
  int   fd;
  short events;
  short revents;
};
#define POLLIN     0x001
#define POLLPRI    0x002
#define POLLOUT    0x004
#define POLLERR    0x008
#define POLLHUP    0x010
#define POLLNVAL   0x020
#define POLLRDNORM 0x040
#define POLLRDBAND 0x080
#define POLLWRNORM POLLOUT
#define POLLWRBAND 0x100
/* poll() implemented over select(). Limitations inherited from select():
   fds must be < FD_SETSIZE (64); POLLPRI maps to the exceptfds set (which this
   runtime never reports, so POLLPRI/POLLERR/POLLHUP never fire); end-of-stream
   shows up as POLLIN (readable), not POLLHUP. */
static inline int poll(struct pollfd *fds, nfds_t nfds, int timeout) {
  fd_set rfds, wfds, efds;
  FD_ZERO(&rfds); FD_ZERO(&wfds); FD_ZERO(&efds);
  int maxfd = -1;
  for (nfds_t i = 0; i < nfds; i++) {
    fds[i].revents = 0;
    int fd = fds[i].fd;
    if (fd < 0) continue;
    if (fds[i].events & (POLLIN | POLLRDNORM)) FD_SET(fd, &rfds);
    if (fds[i].events & (POLLOUT | POLLWRNORM | POLLWRBAND)) FD_SET(fd, &wfds);
    if (fds[i].events & POLLPRI) FD_SET(fd, &efds);
    if (fd > maxfd) maxfd = fd;
  }
  struct timeval tv;
  struct timeval *ptv = 0;
  if (timeout >= 0) { tv.tv_sec = timeout / 1000; tv.tv_usec = (long)(timeout % 1000) * 1000; ptv = &tv; }
  int r = select(maxfd + 1, &rfds, &wfds, &efds, ptv);
  if (r < 0) return -1;
  int count = 0;
  for (nfds_t i = 0; i < nfds; i++) {
    int fd = fds[i].fd;
    if (fd < 0) continue;
    short re = 0;
    if (FD_ISSET(fd, &rfds)) re |= (short)(fds[i].events & (POLLIN | POLLRDNORM));
    if (FD_ISSET(fd, &wfds)) re |= (short)(fds[i].events & (POLLOUT | POLLWRNORM | POLLWRBAND));
    if (FD_ISSET(fd, &efds)) re |= POLLPRI;
    fds[i].revents = re;
    if (re) count++;
  }
  return count;
}
  `,
  "malloc.h": `
#pragma once
/* glibc places the malloc family in <malloc.h> too; forward to <stdlib.h>. */
#include <stdlib.h>
#define M_TRIM_THRESHOLD    -1
#define M_TOP_PAD           -2
#define M_MMAP_THRESHOLD    -3
#define M_MMAP_MAX          -4
#define M_CHECK_ACTION      -5
#define M_PERTURB           -6
#define M_ARENA_TEST        -7
#define M_ARENA_MAX         -8
/* This allocator exposes no tuning or usage introspection: mallopt() accepts
   any option (returns success), malloc_trim() frees nothing, and
   malloc_usable_size() reports 0 (the real slack isn't tracked). */
static inline int mallopt(int param, int value) { (void)param; (void)value; return 1; }
static inline int malloc_trim(unsigned long pad) { (void)pad; return 0; }
static inline unsigned long malloc_usable_size(void *ptr) { (void)ptr; return 0; }
  `,
  "sys/sysmacros.h": `
#pragma once
/* Classic 16-bit major/minor device-number encoding (device numbers are
   cosmetic in this runtime — there are no real devices). */
#define major(dev)       ((int)(((unsigned long)(dev) >> 8) & 0xff))
#define minor(dev)       ((int)((unsigned long)(dev) & 0xff))
#define makedev(ma, mi)  ((unsigned long)(((ma) << 8) | ((mi) & 0xff)))
  `,
  "paths.h": `
#pragma once
#define _PATH_BSHELL    "/bin/sh"
#define _PATH_CONSOLE   "/dev/console"
#define _PATH_DEFPATH   "/usr/bin:/bin"
#define _PATH_STDPATH   "/usr/bin:/bin:/usr/sbin:/sbin"
#define _PATH_DEV       "/dev/"
#define _PATH_DEVNULL   "/dev/null"
#define _PATH_TTY       "/dev/tty"
#define _PATH_TMP       "/tmp/"
#define _PATH_VARTMP    "/var/tmp/"
#define _PATH_VARRUN    "/var/run/"
#define _PATH_PASSWD    "/etc/passwd"
#define _PATH_GROUP     "/etc/group"
#define _PATH_SHADOW    "/etc/shadow"
#define _PATH_SHELLS    "/etc/shells"
#define _PATH_WTMP      "/var/log/wtmp"
#define _PATH_UTMP      "/var/run/utmp"
#define _PATH_LASTLOG   "/var/log/lastlog"
#define _PATH_MAILDIR   "/var/mail"
  `,
  "sys/param.h": `
#pragma once
#include <limits.h>
#ifndef MIN
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#endif
#ifndef MAX
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#endif
#ifndef MAXPATHLEN
#define MAXPATHLEN 4096
#endif
#ifndef PATH_MAX
#define PATH_MAX 4096
#endif
#define NBBY 8
#define MAXSYMLINKS 20
#define howmany(x, y)  (((x) + ((y) - 1)) / (y))
#define roundup(x, y)  ((((x) + ((y) - 1)) / (y)) * (y))
#define powerof2(x)    ((((x) - 1) & (x)) == 0)
  `,
  "sys/times.h": `
#pragma once
#include <sys/types.h>
#include <time.h>
struct tms {
  clock_t tms_utime;
  clock_t tms_stime;
  clock_t tms_cutime;
  clock_t tms_cstime;
};
/* No per-process CPU accounting: report all elapsed time as user time of the
   single process (children are always 0), consistent with clock(). */
static inline clock_t times(struct tms *buf) {
  clock_t c = clock();
  if (buf) { buf->tms_utime = c; buf->tms_stime = 0; buf->tms_cutime = 0; buf->tms_cstime = 0; }
  return c;
}
  `,
  "grp.h": `
#pragma once
#include <sys/types.h>
#include <stddef.h>
/* Single-root group database, mirroring <pwd.h>'s single-root passwd: the only
   group is "root" (gid 0); everything else is NULL. */
struct group {
  char  *gr_name;
  char  *gr_passwd;
  gid_t  gr_gid;
  char **gr_mem;
};
static inline struct group *getgrgid(gid_t gid) {
  static char *mem[] = { 0 };
  static struct group root = { "root", "x", 0, mem };
  return gid == 0 ? &root : NULL;
}
static inline struct group *getgrnam(const char *name) {
  static char *mem[] = { 0 };
  static struct group root = { "root", "x", 0, mem };
  if (name == 0) return NULL;
  const char *r = "root";
  while (*name && *name == *r) { name++; r++; }
  return (*name == 0 && *r == 0) ? &root : NULL;
}
  `,
  "sys/statfs.h": `
#pragma once
#include <sys/types.h>
typedef struct { int val[2]; } __fsid_t;
struct statfs {
  long               f_type;
  long               f_bsize;
  unsigned long long f_blocks;
  unsigned long long f_bfree;
  unsigned long long f_bavail;
  unsigned long long f_files;
  unsigned long long f_ffree;
  __fsid_t           f_fsid;
  long               f_namelen;
  long               f_frsize;
  long               f_flags;
  long               f_spare[4];
};
/* Nominal values only (see <sys/statvfs.h>): a fixed 4 GiB volume; real
   BlockFS geometry would need a host import. */
static inline int statfs(const char *path, struct statfs *buf) {
  (void)path;
  if (buf == 0) return -1;
  buf->f_type = 0; buf->f_bsize = 4096; buf->f_frsize = 4096;
  buf->f_blocks = 1048576; buf->f_bfree = 1048576; buf->f_bavail = 1048576;
  buf->f_files = 65536; buf->f_ffree = 65536;
  buf->f_fsid.val[0] = 0; buf->f_fsid.val[1] = 0;
  buf->f_namelen = 255; buf->f_flags = 0;
  buf->f_spare[0] = buf->f_spare[1] = buf->f_spare[2] = buf->f_spare[3] = 0;
  return 0;
}
static inline int fstatfs(int fd, struct statfs *buf) {
  (void)fd;
  return statfs((const char *)0, buf);
}
  `,
  "dirent.h": `
#pragma once
#include <sys/types.h>
#include <stdlib.h>
__require_source("__dirent.c");

#define DT_UNKNOWN 0
#define DT_DIR     4
#define DT_REG     8
#define DT_LNK    10

/* NOTE: d_ino is always 0 (Node.js directory APIs don't expose inodes).
   Use stat() to get st_ino if needed. */
struct dirent {
  long           d_ino;
  int            d_type;
  char           d_name[256];
};

struct __DIR;
typedef struct __DIR DIR;

DIR *opendir(const char *name);
int closedir(DIR *dirp);
struct dirent *readdir(DIR *dirp);
void rewinddir(DIR *dirp);
  `,
  "dlfcn.h": `
#pragma once
// Stub: dynamic loading (.so / .dylib plugins) is meaningless in wasm.
// dlopen always reports failure; callers should fall back gracefully.
#define RTLD_LAZY   0x0001
#define RTLD_NOW    0x0002
#define RTLD_GLOBAL 0x0100
#define RTLD_LOCAL  0x0000
static inline void *dlopen(const char *file, int mode) { (void)file; (void)mode; return 0; }
static inline int   dlclose(void *handle)              { (void)handle; return 0; }
static inline void *dlsym(void *handle, const char *name) { (void)handle; (void)name; return 0; }
static inline char *dlerror(void)                      { return "dlopen not supported in wasm"; }
  `,
  "emscripten.h": `
#pragma once
__require_source("__emscripten.c");
#define EMSCRIPTEN_KEEPALIVE
void emscripten_set_main_loop(void (*func)(void), int fps, int simulate_infinite_loop);
void emscripten_async_call(void (*func)(void *), void *arg, int millis);
float emscripten_random(void);

// Async HTTP fetch callback typedefs. Used as parameter types of
// emscripten_async_wget3_data() / emscripten_async_wget2_data() in code that
// downloads remote resources at runtime (e.g., tinyemu's network-backed
// disk-image feature). The function itself is not provided here — the
// expectation is that calls into the wget pipeline are dead-code-eliminated
// in builds that don't enable network features.
typedef void (*em_async_wget2_data_onload_func)(unsigned int handle, void *arg, void *data, unsigned int size);
typedef void (*em_async_wget2_data_onerror_func)(unsigned int handle, void *arg, int http_status, const char *status_text);
typedef void (*em_async_wget2_data_onprogress_func)(unsigned int handle, void *arg, int loaded, int total);
  `,
  "errno.h": `
#pragma once
__require_source("__errno.c");
extern int errno;
#define EPERM   1
#define ENOENT  2
#define ESRCH   3
#define EINTR   4
#define EIO     5
#define ENXIO   6
#define E2BIG   7
#define ENOEXEC 8
#define EBADF   9
#define ECHILD  10
#define EAGAIN  11
#define ENOMEM  12
#define EACCES  13
#define EFAULT  14
#define EBUSY   16
#define EEXIST  17
#define EXDEV   18
#define ENODEV  19
#define ENOTDIR 20
#define EISDIR  21
#define EINVAL  22
#define ENFILE  23
#define EMFILE  24
#define ENOTTY  25
#define EFBIG   27
#define ENOSPC  28
#define ESPIPE  29
#define EROFS   30
#define EPIPE   32
#define EDOM    33
#define ERANGE  34
#define EOVERFLOW 75
#define ENAMETOOLONG 36
#define ENOSYS  38
#define ENOTEMPTY 39
#define EWOULDBLOCK EAGAIN
#define ENOLCK    37
#define ETIMEDOUT 110
#define ENOTSOCK     88
#define EDESTADDRREQ 89
#define EPROTOTYPE   91
#define EPROTONOSUPPORT 93
#define EOPNOTSUPP   95
#define ENOTSUP      EOPNOTSUPP
#define EAFNOSUPPORT 97
#define EADDRINUSE   98
#define EADDRNOTAVAIL 99
#define ECONNABORTED 103
#define ECONNRESET   104
#define ENOBUFS      105
#define EISCONN      106
#define ENOTCONN     107
#define ECONNREFUSED 111
#define EHOSTUNREACH 113
#define EALREADY    114
#define EINPROGRESS 115
  `,
  "fcntl.h": `
#pragma once\n#include <stdarg.h>
#include <unistd.h>
#include <sys/types.h>
#define O_RDONLY  0
#define O_WRONLY  1
#define O_RDWR    2
#define O_CREAT   0x40
#define O_EXCL    0x80
#define O_TRUNC   0x200
#define O_APPEND  0x400
#define O_NONBLOCK 0x800
#define O_NOFOLLOW 0x20000
#define O_CLOEXEC  0x80000

#define F_DUPFD    0
#define F_GETFD    1
#define F_SETFD    2
#define F_GETFL    3
#define F_SETFL    4
#define F_GETLK    5
#define F_SETLK    6
#define F_SETLKW   7
#define FD_CLOEXEC 1

#define F_RDLCK  0
#define F_WRLCK  1
#define F_UNLCK  2

/* *at() anchors: dirfd is always treated as the cwd in this libc (see
   utimensat), so AT_FDCWD is the only meaningful value. */
#define AT_FDCWD            (-100)
#define AT_SYMLINK_NOFOLLOW 0x100

struct flock {
  short l_type;
  short l_whence;
  off_t l_start;
  off_t l_len;
  pid_t l_pid;
};

__import int __open_impl(const char *path, int flags, int mode);
int open(const char *path, int flags, ...);
#define F_DUPFD_CLOEXEC 1030  /* Linux value; CLOEXEC is untracked (v1) */
/* Real fcntl for the int-argument commands (F_DUPFD and friends reach the
 * host — the shell's fd-save dance needs them, todos/0005). Lock commands
 * (F_SETLK etc.) pass arg 0 and the host returns success: SQLite's
 * advisory locking stays a no-op in this single-user runtime. */
__import int __fcntl3(int fd, int cmd, int arg);
static inline int fcntl(int fd, int cmd, ...) {
  int arg = 0;
  if (cmd == F_DUPFD || cmd == F_DUPFD_CLOEXEC || cmd == F_SETFD || cmd == F_SETFL) {
    va_list ap;
    va_start(ap, cmd);
    arg = va_arg(ap, int);
    va_end(ap);
  }
  return __fcntl3(fd, cmd, arg);
}
  `,
  "fenv.h": `
#pragma once
#define FE_DIVBYZERO  1
#define FE_INEXACT    2
#define FE_INVALID    4
#define FE_OVERFLOW   8
#define FE_UNDERFLOW  16
#define FE_ALL_EXCEPT (FE_DIVBYZERO|FE_INEXACT|FE_INVALID|FE_OVERFLOW|FE_UNDERFLOW)
#define FE_TONEAREST  0
#define FE_DOWNWARD   1
#define FE_UPWARD     2
#define FE_TOWARDZERO 3
#define FE_DFL_ENV    ((const fenv_t *)0)
typedef unsigned int fexcept_t;
typedef unsigned int fenv_t;
static inline int feclearexcept(int e) { (void)e; return 0; }
static inline int fegetexceptflag(fexcept_t *f, int e) { (void)f; (void)e; return 0; }
static inline int feraiseexcept(int e) { (void)e; return 0; }
static inline int fesetexceptflag(const fexcept_t *f, int e) { (void)f; (void)e; return 0; }
static inline int fetestexcept(int e) { (void)e; return 0; }
static inline int fegetround(void) { return FE_TONEAREST; }
static inline int fesetround(int r) { (void)r; return 0; }
static inline int fegetenv(fenv_t *e) { (void)e; return 0; }
static inline int feholdexcept(fenv_t *e) { (void)e; return 0; }
static inline int fesetenv(const fenv_t *e) { (void)e; return 0; }
static inline int feupdateenv(const fenv_t *e) { (void)e; return 0; }
  `,
  "float.h": `
#pragma once
#define FLT_RADIX 2
#define FLT_ROUNDS 1
#define FLT_EVAL_METHOD 0
#define DECIMAL_DIG 21
#define FLT_DIG 6
#define FLT_MANT_DIG 24
#define FLT_MIN_EXP (-125)
#define FLT_MAX_EXP 128
#define FLT_MIN_10_EXP (-37)
#define FLT_MAX_10_EXP 38
#define FLT_MIN 1.17549435e-38F
#define FLT_MAX 3.40282347e+38F
#define FLT_EPSILON 1.19209290e-7F
#define FLT_TRUE_MIN 1.40129846e-45F
#define DBL_DIG 15
#define DBL_MANT_DIG 53
#define DBL_MIN_EXP (-1021)
#define DBL_MAX_EXP 1024
#define DBL_MIN_10_EXP (-307)
#define DBL_MAX_10_EXP 308
#define DBL_MIN 2.2250738585072014e-308
#define DBL_MAX 1.7976931348623157e+308
#define DBL_EPSILON 2.2204460492503131e-16
#define DBL_TRUE_MIN 4.9406564584124654e-324
#define LDBL_DIG DBL_DIG
#define LDBL_MANT_DIG DBL_MANT_DIG
#define LDBL_MIN_EXP DBL_MIN_EXP
#define LDBL_MAX_EXP DBL_MAX_EXP
#define LDBL_MIN_10_EXP DBL_MIN_10_EXP
#define LDBL_MAX_10_EXP DBL_MAX_10_EXP
#define LDBL_MIN DBL_MIN
#define LDBL_MAX DBL_MAX
#define LDBL_EPSILON DBL_EPSILON
#define LDBL_TRUE_MIN DBL_TRUE_MIN
  `,
  "getopt.h": `
#pragma once
__require_source("__getopt.c");

extern char *optarg;
extern int optind;
extern int opterr;
extern int optopt;

#define no_argument        0
#define required_argument  1
#define optional_argument  2

struct option {
  const char *name;
  int has_arg;
  int *flag;
  int val;
};

int getopt(int argc, char *const argv[], const char *optstring);
int getopt_long(int argc, char *const argv[], const char *optstring,
                const struct option *longopts, int *longindex);
int getopt_long_only(int argc, char *const argv[], const char *optstring,
                     const struct option *longopts, int *longindex);
  `,
  "inttypes.h": `
#pragma once
#include <stdint.h>

// Format macros for fprintf (wasm32: int=32, long=32, long long=64)
#define PRId8  "d"
#define PRId16 "d"
#define PRId32 "d"
#define PRId64 "lld"
#define PRIi8  "i"
#define PRIi16 "i"
#define PRIi32 "i"
#define PRIi64 "lli"
#define PRIu8  "u"
#define PRIu16 "u"
#define PRIu32 "u"
#define PRIu64 "llu"
#define PRIo8  "o"
#define PRIo16 "o"
#define PRIo32 "o"
#define PRIo64 "llo"
#define PRIx8  "x"
#define PRIx16 "x"
#define PRIx32 "x"
#define PRIx64 "llx"
#define PRIX8  "X"
#define PRIX16 "X"
#define PRIX32 "X"
#define PRIX64 "llX"

#define PRIdLEAST8  PRId8
#define PRIdLEAST16 PRId16
#define PRIdLEAST32 PRId32
#define PRIdLEAST64 PRId64
#define PRIiLEAST8  PRIi8
#define PRIiLEAST16 PRIi16
#define PRIiLEAST32 PRIi32
#define PRIiLEAST64 PRIi64
#define PRIuLEAST8  PRIu8
#define PRIuLEAST16 PRIu16
#define PRIuLEAST32 PRIu32
#define PRIuLEAST64 PRIu64
#define PRIoLEAST8  PRIo8
#define PRIoLEAST16 PRIo16
#define PRIoLEAST32 PRIo32
#define PRIoLEAST64 PRIo64
#define PRIxLEAST8  PRIx8
#define PRIxLEAST16 PRIx16
#define PRIxLEAST32 PRIx32
#define PRIxLEAST64 PRIx64
#define PRIXLEAST8  PRIX8
#define PRIXLEAST16 PRIX16
#define PRIXLEAST32 PRIX32
#define PRIXLEAST64 PRIX64

#define PRIdFAST8  PRId8
#define PRIdFAST16 PRId32
#define PRIdFAST32 PRId32
#define PRIdFAST64 PRId64
#define PRIiFAST8  PRIi8
#define PRIiFAST16 PRIi32
#define PRIiFAST32 PRIi32
#define PRIiFAST64 PRIi64
#define PRIuFAST8  PRIu8
#define PRIuFAST16 PRIu32
#define PRIuFAST32 PRIu32
#define PRIuFAST64 PRIu64
#define PRIoFAST8  PRIo8
#define PRIoFAST16 PRIo32
#define PRIoFAST32 PRIo32
#define PRIoFAST64 PRIo64
#define PRIxFAST8  PRIx8
#define PRIxFAST16 PRIx32
#define PRIxFAST32 PRIx32
#define PRIxFAST64 PRIx64
#define PRIXFAST8  PRIX8
#define PRIXFAST16 PRIX32
#define PRIXFAST32 PRIX32
#define PRIXFAST64 PRIX64

#define PRIdPTR "d"
#define PRIiPTR "i"
#define PRIuPTR "u"
#define PRIoPTR "o"
#define PRIxPTR "x"
#define PRIXPTR "X"

#define PRIdMAX PRId64
#define PRIiMAX PRIi64
#define PRIuMAX PRIu64
#define PRIoMAX PRIo64
#define PRIxMAX PRIx64
#define PRIXMAX PRIX64

// Format macros for fscanf
#define SCNd8  "hhd"
#define SCNd16 "hd"
#define SCNd32 "d"
#define SCNd64 "lld"
#define SCNi8  "hhi"
#define SCNi16 "hi"
#define SCNi32 "i"
#define SCNi64 "lli"
#define SCNu8  "hhu"
#define SCNu16 "hu"
#define SCNu32 "u"
#define SCNu64 "llu"
#define SCNo8  "hho"
#define SCNo16 "ho"
#define SCNo32 "o"
#define SCNo64 "llo"
#define SCNx8  "hhx"
#define SCNx16 "hx"
#define SCNx32 "x"
#define SCNx64 "llx"

#define SCNdLEAST8  SCNd8
#define SCNdLEAST16 SCNd16
#define SCNdLEAST32 SCNd32
#define SCNdLEAST64 SCNd64
#define SCNiLEAST8  SCNi8
#define SCNiLEAST16 SCNi16
#define SCNiLEAST32 SCNi32
#define SCNiLEAST64 SCNi64
#define SCNuLEAST8  SCNu8
#define SCNuLEAST16 SCNu16
#define SCNuLEAST32 SCNu32
#define SCNuLEAST64 SCNu64
#define SCNoLEAST8  SCNo8
#define SCNoLEAST16 SCNo16
#define SCNoLEAST32 SCNo32
#define SCNoLEAST64 SCNo64
#define SCNxLEAST8  SCNx8
#define SCNxLEAST16 SCNx16
#define SCNxLEAST32 SCNx32
#define SCNxLEAST64 SCNx64

#define SCNdFAST8  SCNd8
#define SCNdFAST16 SCNd32
#define SCNdFAST32 SCNd32
#define SCNdFAST64 SCNd64
#define SCNiFAST8  SCNi8
#define SCNiFAST16 SCNi32
#define SCNiFAST32 SCNi32
#define SCNiFAST64 SCNi64
#define SCNuFAST8  SCNu8
#define SCNuFAST16 SCNu32
#define SCNuFAST32 SCNu32
#define SCNuFAST64 SCNu64
#define SCNoFAST8  SCNo8
#define SCNoFAST16 SCNo32
#define SCNoFAST32 SCNo32
#define SCNoFAST64 SCNo64
#define SCNxFAST8  SCNx8
#define SCNxFAST16 SCNx32
#define SCNxFAST32 SCNx32
#define SCNxFAST64 SCNx64

#define SCNdPTR "d"
#define SCNiPTR "i"
#define SCNuPTR "u"
#define SCNoPTR "o"
#define SCNxPTR "x"

#define SCNdMAX SCNd64
#define SCNiMAX SCNi64
#define SCNuMAX SCNu64
#define SCNoMAX SCNo64
#define SCNxMAX SCNx64

// Functions
typedef struct { intmax_t quot; intmax_t rem; } imaxdiv_t;

intmax_t imaxabs(intmax_t n);
imaxdiv_t imaxdiv(intmax_t numer, intmax_t denom);
intmax_t strtoimax(const char *nptr, char **endptr, int base);
uintmax_t strtoumax(const char *nptr, char **endptr, int base);
  `,
  "iso646.h": `
#pragma once
#define and    &&
#define and_eq &=
#define bitand &
#define bitor  |
#define compl  ~
#define not    !
#define not_eq !=
#define or     ||
#define or_eq  |=
#define xor    ^
#define xor_eq ^=
  `,
  "limits.h": `
#pragma once
#define CHAR_BIT 8
#define SCHAR_MIN (-128)
#define SCHAR_MAX 127
#define UCHAR_MAX 255
#define CHAR_MIN SCHAR_MIN
#define CHAR_MAX SCHAR_MAX
#define MB_LEN_MAX 4
#define SHRT_MIN (-32768)
#define SHRT_MAX 32767
#define USHRT_MAX 65535
#define INT_MIN (-2147483647 - 1)
#define INT_MAX 2147483647
#define UINT_MAX 4294967295U
#define LONG_MIN (-2147483647L - 1L)
#define LONG_MAX 2147483647L
#define ULONG_MAX 4294967295UL
/* POSIX: maximum value of an object of type ssize_t */
#define SSIZE_MAX 2147483647L
/* POSIX: maximum length of a pathname, including the terminating NUL */
#define PATH_MAX 4096
/* POSIX: maximum length of a filename (excluding NUL) */
#define NAME_MAX 255
/* POSIX <regex.h> limits: max repetitions in an interval, and longest
   character-class name. */
#define RE_DUP_MAX 255
#define CHARCLASS_NAME_MAX 14
#define LLONG_MIN (-9223372036854775807LL - 1LL)
#define LLONG_MAX 9223372036854775807LL
#define ULLONG_MAX 18446744073709551615ULL
  `,
  "locale.h": `
#pragma once
__require_source("__locale.c");
#include <stddef.h>
#define NULL ((void *)0)

#define LC_ALL      0
#define LC_COLLATE  1
#define LC_CTYPE    2
#define LC_MONETARY 3
#define LC_NUMERIC  4
#define LC_TIME     5

struct lconv {
  char *decimal_point;
  char *thousands_sep;
  char *grouping;
  char *int_curr_symbol;
  char *currency_symbol;
  char *mon_decimal_point;
  char *mon_thousands_sep;
  char *mon_grouping;
  char *positive_sign;
  char *negative_sign;
  char int_frac_digits;
  char frac_digits;
  char p_cs_precedes;
  char p_sep_by_space;
  char n_cs_precedes;
  char n_sep_by_space;
  char p_sign_posn;
  char n_sign_posn;
};

char *setlocale(int category, const char *locale);
struct lconv *localeconv(void);
  `,
  "langinfo.h": `
#pragma once
__require_source("__locale.c");

/* POSIX <langinfo.h> over the C/C.UTF-8 locale pair. CODESET is the
   load-bearing item: this libc's mb/wc codec is unconditionally UTF-8
   (MB_CUR_MAX 4), so CODESET answers "UTF-8" regardless of the name set
   via setlocale (the musl model). The remaining items answer with the
   portable C-locale strings. Item numbering is libc-private — there is
   no external ABI to match. */
typedef int nl_item;

#define CODESET     0
#define D_T_FMT     1
#define D_FMT       2
#define T_FMT       3
#define T_FMT_AMPM  4
#define AM_STR      5
#define PM_STR      6
#define DAY_1       7
#define DAY_2       8
#define DAY_3       9
#define DAY_4       10
#define DAY_5       11
#define DAY_6       12
#define DAY_7       13
#define ABDAY_1     14
#define ABDAY_2     15
#define ABDAY_3     16
#define ABDAY_4     17
#define ABDAY_5     18
#define ABDAY_6     19
#define ABDAY_7     20
#define MON_1       21
#define MON_2       22
#define MON_3       23
#define MON_4       24
#define MON_5       25
#define MON_6       26
#define MON_7       27
#define MON_8       28
#define MON_9       29
#define MON_10      30
#define MON_11      31
#define MON_12      32
#define ABMON_1     33
#define ABMON_2     34
#define ABMON_3     35
#define ABMON_4     36
#define ABMON_5     37
#define ABMON_6     38
#define ABMON_7     39
#define ABMON_8     40
#define ABMON_9     41
#define ABMON_10    42
#define ABMON_11    43
#define ABMON_12    44
#define RADIXCHAR   45
#define THOUSEP     46
#define YESEXPR     47
#define NOEXPR      48
#define CRNCYSTR    49
#define ERA         50
#define ERA_D_FMT   51
#define ERA_D_T_FMT 52
#define ERA_T_FMT   53
#define ALT_DIGITS  54

char *nl_langinfo(nl_item item);
  `,
  "math.h": `
#pragma once
__require_source("__math.c");

#define INFINITY (1.0f / 0.0f)
#define NAN (0.0f / 0.0f)
#define HUGE_VAL ((double)INFINITY)
#define HUGE_VALF INFINITY
#define HUGE_VALL ((long double)INFINITY)

#define M_E        2.71828182845904523536
#define M_LOG2E    1.44269504088896340736
#define M_LOG10E   0.43429448190325182765
#define M_LN2      0.69314718055994530942
#define M_LN10     2.30258509299404568402
#define M_PI       3.14159265358979323846
#define M_PI_2     1.57079632679489661923
#define M_PI_4     0.78539816339744830962
#define M_1_PI     0.31830988618379067154
#define M_2_PI     0.63661977236758134308
#define M_2_SQRTPI 1.12837916709551257390
#define M_SQRT2    1.41421356237309504880
#define M_SQRT1_2  0.70710678118654752440

double fabs(double x);
double ceil(double x);
double floor(double x);
double trunc(double x);
double nearbyint(double x);
double rint(double x);
double sqrt(double x);

float fabsf(float x);
float ceilf(float x);
float floorf(float x);
float truncf(float x);
float nearbyintf(float x);
float rintf(float x);
float sqrtf(float x);

double fmin(double x, double y);
double fmax(double x, double y);
double copysign(double x, double y);

float fminf(float x, float y);
float fmaxf(float x, float y);
float copysignf(float x, float y);

// Host-imported math functions
__import double sin(double x);
__import double cos(double x);
__import double tan(double x);
__import double asin(double x);
__import double acos(double x);
__import double atan(double x);
__import double atan2(double y, double x);
__import double sinh(double x);
__import double cosh(double x);
__import double tanh(double x);
__import double asinh(double x);
__import double acosh(double x);
__import double atanh(double x);
__import double exp(double x);
__import double expm1(double x);
__import double log(double x);
__import double log2(double x);
__import double log10(double x);
__import double log1p(double x);
__import double pow(double x, double y);
__import double cbrt(double x);
__import double hypot(double x, double y);
__import double fmod(double x, double y);

float sinf(float x);
float cosf(float x);
float tanf(float x);
float asinf(float x);
float acosf(float x);
float atanf(float x);
float atan2f(float y, float x);
float sinhf(float x);
float coshf(float x);
float tanhf(float x);
float asinhf(float x);
float acoshf(float x);
float atanhf(float x);
float expf(float x);
double exp2(double x);
float exp2f(float x);
float expm1f(float x);
float logf(float x);
float log2f(float x);
float log10f(float x);
float log1pf(float x);
float powf(float x, float y);
float cbrtf(float x);
float hypotf(float x, float y);
float fmodf(float x, float y);

double round(double x);
float roundf(float x);
double fdim(double x, double y);
float fdimf(float x, float y);
long lround(double x);
long lrint(double x);
long lroundf(float x);
long lrintf(float x);
double nextafter(double x, double y);
float nextafterf(float x, float y);
double frexp(double x, int *exp);
double ldexp(double x, int n);
float ldexpf(float x, int n);
int ilogb(double x);
double logb(double x);
double modf(double x, double *iptr);
float modff(float x, float *iptr);

// C99 §7.12.11.2: nan/nanf return a quiet NaN. We ignore the tag arg
// and just return NAN — sufficient for "nan" string parsing.
double nan(const char *tag);
float nanf(const char *tag);

// C99 special functions (host-imported).
__import double erf(double x);
__import double erfc(double x);
__import double tgamma(double x);
__import double lgamma(double x);
float erff(float x);
float erfcf(float x);
float tgammaf(float x);
float lgammaf(float x);

// C99 classification macros. We provide function-style impls; users
// invoke as isnan(x), isinf(x), etc. (the standard prescribes macros
// but functions are accepted in any real compiler).
int __isnand(double x);
int __isinfd(double x);
int __isfinited(double x);
int __isnormald(double x);
int __signbitd(double x);
int __isnanf(float x);
int __isinff(float x);
int __isfinitef(float x);
int __isnormalf(float x);
int __signbitf(float x);
#define isnan(x)    _Generic((x), float: __isnanf,    default: __isnand)(x)
#define isinf(x)    _Generic((x), float: __isinff,    default: __isinfd)(x)
#define isfinite(x) _Generic((x), float: __isfinitef, default: __isfinited)(x)
#define isnormal(x) _Generic((x), float: __isnormalf, default: __isnormald)(x)
#define signbit(x)  _Generic((x), float: __signbitf,  default: __signbitd)(x)

// frexpf: float version of frexp.
float frexpf(float x, int *exp);
  `,
  "setjmp.h": `
#pragma once
__require_source("__setjmp.c");
typedef int jmp_buf[1];
__exception __LongJump(int, int);
extern int __setjmp_id_counter;
__import int setjmp(jmp_buf env);
__import void longjmp(jmp_buf env, int val);
/* POSIX sigsetjmp/siglongjmp: signals are cooperative on this platform and
 * there is no blocked-signal mask to save, so these are exactly setjmp/
 * longjmp. Macros (not wrappers) so the compiler's setjmp lowering sees the
 * plain setjmp call after preprocessing. */
typedef jmp_buf sigjmp_buf;
#define sigsetjmp(env, savemask) setjmp(env)
#define siglongjmp(env, val) longjmp(env, val)
`,
  "sched.h": `
#pragma once
/* Minimal POSIX scheduling surface (todos/0035: busybox less calls
   sched_yield() in its non-blocking-stdin retry loop). Processes are
   single-threaded and cooperative here — there is nobody in-process to
   yield to, so yielding is a successful no-op; real waiting happens in
   blocking kernel RPCs. */
static inline int sched_yield(void) { return 0; }
`,
  "signal.h": `
#pragma once
__require_source("__signal.c");
typedef int sig_atomic_t;
typedef void (*__sighandler_t)(int);
typedef __sighandler_t sighandler_t;
typedef __sighandler_t sig_t;
#define SIG_DFL ((__sighandler_t)0)
#define SIG_IGN ((__sighandler_t)1)
#define SIG_ERR ((__sighandler_t)-1)
#define SIGABRT 6
#define SIGFPE  8
#define SIGILL  4
#define SIGINT  2
#define SIGSEGV 11
#define SIGTERM 15
#define SIGHUP  1
#define SIGQUIT 3
#define SIGTRAP 5
#define SIGKILL 9
#define SIGBUS  7
#define SIGSYS  31
#define SIGPIPE 13
#define SIGALRM 14
#define SIGURG  23
#define SIGSTOP 19
#define SIGTSTP 20
#define SIGCONT 18
#define SIGCHLD 17
#define SIGTTIN 21
#define SIGTTOU 22
#define SIGUSR1 10
#define SIGUSR2 12
#define SIGIO   29
#define SIGPROF 27
#define SIGWINCH 28
#define SIGVTALRM 26
#define SIGXCPU 24
#define SIGXFSZ 25
#define NSIG 32

/* sigprocmask 'how' */
#define SIG_BLOCK   0
#define SIG_UNBLOCK 1
#define SIG_SETMASK 2

/* sa_flags */
#define SA_NOCLDSTOP 0x00000001
#define SA_NOCLDWAIT 0x00000002
#define SA_SIGINFO   0x00000004
#define SA_ONSTACK   0x08000000
#define SA_RESTART   0x10000000
#define SA_NODEFER   0x40000000
#define SA_RESETHAND 0x80000000

typedef unsigned long long sigset_t;

union sigval { int sival_int; void *sival_ptr; };
typedef struct {
  int si_signo, si_code, si_errno, si_pid, si_uid, si_status;
  void *si_addr;
  union sigval si_value;
} siginfo_t;

struct sigaction {
  __sighandler_t sa_handler;
  void (*sa_sigaction)(int, siginfo_t *, void *);
  sigset_t sa_mask;
  int sa_flags;
  void (*sa_restorer)(void);
};

__sighandler_t signal(int __sig, __sighandler_t __handler);
int raise(int __sig);
int sigaction(int __sig, const struct sigaction *__act, struct sigaction *__old);
int sigemptyset(sigset_t *__set);
int sigfillset(sigset_t *__set);
int sigaddset(sigset_t *__set, int __sig);
int sigdelset(sigset_t *__set, int __sig);
int sigismember(const sigset_t *__set, int __sig);
int sigprocmask(int __how, const sigset_t *__set, sigset_t *__old);
int sigpending(sigset_t *__set);
int pause(void);
int sigsuspend(const sigset_t *__mask);
int kill(int __pid, int __sig);
int killpg(int __pgrp, int __sig);

/* Notify the runtime of a disposition change (kind: 0=DFL 1=IGN 2=HANDLER) so
   the process kernel's kill() applies the right action. Host-provided. */
__import void __on_sigdisp(int __sig, int __kind);
/* Publish the blocked mask to the kernel page (low 32 bits; NSIG is 32) and
   let the host deliver any kernel-pending signal that just became
   unblocked. No-op without a kernel. Host-provided. */
__import void __on_sigmask(unsigned __mask);
/* Park on the kernel doorbell until a signal has been DELIVERED (the host
   runs the handlers before this returns). -1/ENOSYS without a kernel —
   never hangs. Backs pause()/sigsuspend(). Host-provided. */
__import int __sig_pause(void);
  `,
  "stdalign.h": `
#pragma once
#define alignof _Alignof
#define alignas _Alignas
#define __alignof_is_defined 1
#define __alignas_is_defined 1
  `,
  "stdarg.h": `
#pragma once
typedef int *__va_elem;
typedef __va_elem va_list[1];
#define va_start(ap, param) __builtin_va_start(ap[0], param)
#define va_arg(ap, type) __builtin_va_arg(ap[0], type)
#define va_end(ap) __builtin_va_end(ap[0])
#define va_copy(dest, src) __builtin_va_copy(dest[0], src[0])
  `,
  "stdbool.h": `
#pragma once
#define bool _Bool
#define true 1
#define false 0
#define __bool_true_false_are_defined 1
  `,
  "stddef.h": `
#pragma once
typedef unsigned long size_t; // Use long for all pointer-sized types
typedef long ptrdiff_t;
typedef int wchar_t;
typedef long double max_align_t;
#define NULL ((void *)0)
#define offsetof(type, member) ((size_t)&((type *)0)->member)
  `,
  "stdint.h": `
#pragma once

// Exact-width integer types
typedef signed char int8_t;
typedef unsigned char uint8_t;
typedef short int16_t;
typedef unsigned short uint16_t;
typedef int int32_t;
typedef unsigned int uint32_t;
typedef long long int64_t;
typedef unsigned long long uint64_t;

// Minimum-width integer types (use exact-width types)
typedef int8_t int_least8_t;
typedef uint8_t uint_least8_t;
typedef int16_t int_least16_t;
typedef uint16_t uint_least16_t;
typedef int32_t int_least32_t;
typedef uint32_t uint_least32_t;
typedef int64_t int_least64_t;
typedef uint64_t uint_least64_t;

// Fastest minimum-width integer types
// For wasm32, 32-bit operations are native
typedef int8_t int_fast8_t;
typedef uint8_t uint_fast8_t;
typedef int32_t int_fast16_t;
typedef uint32_t uint_fast16_t;
typedef int32_t int_fast32_t;
typedef uint32_t uint_fast32_t;
typedef int64_t int_fast64_t;
typedef uint64_t uint_fast64_t;

// Integer types capable of holding object pointers
typedef long intptr_t;
typedef unsigned long uintptr_t;

// Greatest-width integer types
typedef int64_t intmax_t;
typedef uint64_t uintmax_t;

// Limits of exact-width integer types
#define INT8_MIN (-128)
#define INT8_MAX 127
#define UINT8_MAX 255
#define INT16_MIN (-32768)
#define INT16_MAX 32767
#define UINT16_MAX 65535
#define INT32_MIN (-2147483647 - 1)
#define INT32_MAX 2147483647
#define UINT32_MAX 4294967295U
#define INT64_MIN (-9223372036854775807LL - 1LL)
#define INT64_MAX 9223372036854775807LL
#define UINT64_MAX 18446744073709551615ULL

// Limits of minimum-width integer types
#define INT_LEAST8_MIN INT8_MIN
#define INT_LEAST8_MAX INT8_MAX
#define UINT_LEAST8_MAX UINT8_MAX
#define INT_LEAST16_MIN INT16_MIN
#define INT_LEAST16_MAX INT16_MAX
#define UINT_LEAST16_MAX UINT16_MAX
#define INT_LEAST32_MIN INT32_MIN
#define INT_LEAST32_MAX INT32_MAX
#define UINT_LEAST32_MAX UINT32_MAX
#define INT_LEAST64_MIN INT64_MIN
#define INT_LEAST64_MAX INT64_MAX
#define UINT_LEAST64_MAX UINT64_MAX

// Limits of fastest minimum-width integer types
#define INT_FAST8_MIN INT8_MIN
#define INT_FAST8_MAX INT8_MAX
#define UINT_FAST8_MAX UINT8_MAX
#define INT_FAST16_MIN INT32_MIN
#define INT_FAST16_MAX INT32_MAX
#define UINT_FAST16_MAX UINT32_MAX
#define INT_FAST32_MIN INT32_MIN
#define INT_FAST32_MAX INT32_MAX
#define UINT_FAST32_MAX UINT32_MAX
#define INT_FAST64_MIN INT64_MIN
#define INT_FAST64_MAX INT64_MAX
#define UINT_FAST64_MAX UINT64_MAX

// Limits of integer types capable of holding object pointers
#define INTPTR_MIN INT32_MIN
#define INTPTR_MAX INT32_MAX
#define UINTPTR_MAX UINT32_MAX

// Limits of greatest-width integer types
#define INTMAX_MIN INT64_MIN
#define INTMAX_MAX INT64_MAX
#define UINTMAX_MAX UINT64_MAX

// Limits of other integer types
#define PTRDIFF_MIN INT32_MIN
#define PTRDIFF_MAX INT32_MAX
#define SIZE_MAX UINT32_MAX

// Macros for integer constant expressions
#define INT8_C(x) (x)
#define INT16_C(x) (x)
#define INT32_C(x) (x)
#define INT64_C(x) (x ## LL)
#define UINT8_C(x) (x)
#define UINT16_C(x) (x)
#define UINT32_C(x) (x ## U)
#define UINT64_C(x) (x ## ULL)
#define INTMAX_C(x) INT64_C(x)
#define UINTMAX_C(x) UINT64_C(x)
  `,
  "stdio.h": `
#pragma once
__require_source("__stdio.c");
#include <stddef.h>
#include <stdarg.h>
#define NULL ((void *)0)
#define EOF (-1)

#define _IOFBF 0
#define _IOLBF 1
#define _IONBF 2
#define BUFSIZ 1024
#define FOPEN_MAX 64
#define FILENAME_MAX 4096
#define L_tmpnam 20
#define TMP_MAX 10000

#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2

#define __F_READ  1
#define __F_WRITE 2
#define __F_APPEND 4
#define __F_EOF   8
#define __F_ERR   16
/* The buffer currently holds data from fread/buffered input.
 * Used to keep fflush from treating a partially-consumed read buffer
 * as pending write data in an r+ / w+ stream. */
#define __F_RBUF  32
/* The buffer was allocated by the library (fclose/setvbuf may free it).
 * Not set for the static stdio buffers or user buffers from setvbuf. */
#define __F_OWNBUF 64
/* The FILE object itself is static (stdin/stdout/stderr): fclose must
 * mark it closed but must not free() it. */
#define __F_STATIC 128

typedef struct FILE {
  int fd;
  int flags;
  int buf_mode;
  char *buf;
  int buf_size;
  int buf_pos;
  int buf_len;
  int ungetc_char;
} FILE;

/* 64-bit, opaque file position (LFS): fgetpos/fsetpos can address files past
   2 GiB even though the standard fseek/ftell stay long-bounded. */
typedef long long fpos_t;

extern FILE __stdin_file;
extern FILE __stdout_file;
extern FILE __stderr_file;

#define stdin  (&__stdin_file)
#define stdout (&__stdout_file)
#define stderr (&__stderr_file)

int sprintf(char *buf, const char *fmt, ...);
int snprintf(char *buf, size_t size, const char *fmt, ...);
__import int vsnprintf(char *buf, size_t size, const char *fmt, va_list ap);

int printf(const char *fmt, ...);
int vprintf(const char *fmt, va_list ap);
int fprintf(FILE *stream, const char *fmt, ...);
int dprintf(int fd, const char *fmt, ...);
int vdprintf(int fd, const char *fmt, va_list ap);
int vfprintf(FILE *stream, const char *fmt, va_list ap);
int vsprintf(char *buf, const char *fmt, va_list ap);
int putchar(int c);
int puts(const char *s);
FILE *fopen(const char *path, const char *mode);
FILE *fdopen(int fd, const char *mode);
int fileno(FILE *stream);
int fclose(FILE *stream);
size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream);
size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream);
int fflush(FILE *stream);
int fputs(const char *s, FILE *stream);
int fputc(int c, FILE *stream);
int fgetc(FILE *stream);
char *fgets(char *s, int n, FILE *stream);
int ungetc(int c, FILE *stream);

int fseek(FILE *stream, long offset, int whence);
long ftell(FILE *stream);
void rewind(FILE *stream);
int fgetpos(FILE *stream, fpos_t *pos);
int fsetpos(FILE *stream, const fpos_t *pos);
/* POSIX off_t-wide seek/tell (>2 GiB safe, like fgetpos/fsetpos). */
typedef long long off_t;
int fseeko(FILE *stream, off_t offset, int whence);
off_t ftello(FILE *stream);

int feof(FILE *stream);
int ferror(FILE *stream);
void clearerr(FILE *stream);
int setvbuf(FILE *stream, char *buf, int mode, size_t size);
void setbuf(FILE *stream, char *buf);
void perror(const char *s);
char *gets(char *s);

__import int __vsscanf_impl(const char *str, int str_len, const char *fmt,
                            int *consumed, va_list ap);
int vsscanf(const char *s, const char *fmt, va_list ap);
int sscanf(const char *s, const char *fmt, ...);
int vfscanf(FILE *stream, const char *fmt, va_list ap);
int fscanf(FILE *stream, const char *fmt, ...);
int vscanf(const char *fmt, va_list ap);
int scanf(const char *fmt, ...);

__import int remove(const char *path);
__import int rename(const char *oldpath, const char *newpath);

FILE *freopen(const char *path, const char *mode, FILE *stream);
FILE *tmpfile(void);
char *tmpnam(char *s);
FILE *popen(const char *command, const char *type);
int pclose(FILE *stream);

#define getc(stream)     fgetc(stream)
#define getchar()        fgetc(stdin)
#define putc(c, stream)  fputc(c, stream)
  `,
  "stdlib.h": `
#pragma once
__require_source("__stdlib.c");
#include <stddef.h>
#include <__atexit.h>
#include <__malloc.h>

#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1
#define RAND_MAX 32767

int abs(int n);
long labs(long n);

typedef struct { int quot; int rem; } div_t;
typedef struct { long quot; long rem; } ldiv_t;
typedef struct { long long quot; long long rem; } lldiv_t;
div_t div(int numer, int denom);
ldiv_t ldiv(long numer, long denom);
lldiv_t lldiv(long long numer, long long denom);

int atoi(const char *nptr);
long atol(const char *nptr);
long long atoll(const char *nptr);
long strtol(const char *nptr, char **endptr, int base);
unsigned long strtoul(const char *nptr, char **endptr, int base);
long long strtoll(const char *nptr, char **endptr, int base);
unsigned long long strtoull(const char *nptr, char **endptr, int base);
double strtod(const char *nptr, char **endptr);
float strtof(const char *nptr, char **endptr);
long double strtold(const char *nptr, char **endptr);
double atof(const char *nptr);
long long llabs(long long n);
int rand(void);
void srand(unsigned int seed);
void *bsearch(const void *key, const void *base, size_t nmemb,
              size_t size, int (*compar)(const void *, const void *));
void qsort(void *base, size_t nmemb, size_t size,
           int (*compar)(const void *, const void *));
void exit(int status);
void abort(void);

char *getenv(const char *name);
int setenv(const char *name, const char *value, int overwrite);
int unsetenv(const char *name);
int putenv(char *string);
int clearenv(void);
int system(const char *command);
int mkstemp(char *template_);
char *mktemp(char *template_);
char *mkdtemp(char *template_);

#define MB_CUR_MAX 4  /* UTF-8, matching the restartable mbrtowc/wcrtomb family */
int mblen(const char *s, size_t n);
int mbtowc(wchar_t *pwc, const char *s, size_t n);
int wctomb(char *s, wchar_t wc);
size_t mbstowcs(wchar_t *dest, const char *src, size_t n);
size_t wcstombs(char *dest, const wchar_t *src, size_t n);
  `,
  "stdnoreturn.h": `
#pragma once
#define noreturn _Noreturn
  `,
  "string.h": `
#pragma once
__require_source("__string.c");
#include <stddef.h>
#define NULL ((void *)0)
void *memcpy(void *dest, const void *src, size_t n);
void *memmove(void *dest, const void *src, size_t n);
void *memset(void *s, int c, size_t n);
int memcmp(const void *s1, const void *s2, size_t n);
size_t strlen(const char *s);
size_t strnlen(const char *s, size_t maxlen);
char *strcpy(char *dest, const char *src);
char *strncpy(char *dest, const char *src, size_t n);
int strcmp(const char *s1, const char *s2);
int strncmp(const char *s1, const char *s2, size_t n);
char *strcat(char *dest, const char *src);
char *strchr(const char *s, int c);
char *strchrnul(const char *s, int c);
#define __strchrnul strchrnul
char *strrchr(const char *s, int c);
char *strstr(const char *haystack, const char *needle);
size_t strlcpy(char *dst, const char *src, size_t size);
size_t strlcat(char *dst, const char *src, size_t size);
void *memmem(const void *haystack, size_t haystacklen, const void *needle, size_t needlelen);
void *memchr(const void *s, int c, size_t n);
char *strncat(char *dest, const char *src, size_t n);
size_t strspn(const char *s, const char *accept);
size_t strcspn(const char *s, const char *reject);
char *strpbrk(const char *s, const char *accept);
char *strtok(char *str, const char *delim);
int strcoll(const char *s1, const char *s2);
size_t strxfrm(char *dest, const char *src, size_t n);
char *strerror(int errnum);
char *strdup(const char *s);
  `,
  "strings.h": `
#pragma once
__require_source("__strings.c");
#include <stddef.h>
int strcasecmp(const char *s1, const char *s2);
int strncasecmp(const char *s1, const char *s2, size_t n);
char *strcasestr(const char *haystack, const char *needle);
int ffs(int x);
int ffsl(long x);
int ffsll(long long x);
int fls(int x);
int flsl(long x);
int flsll(long long x);
  `,
  "sys/stat.h": `
#pragma once
#include <sys/types.h>

#define S_IRWXU 0700
#define S_IRUSR 0400
#define S_IWUSR 0200
#define S_IXUSR 0100
#define S_IRWXG 0070
#define S_IRGRP 0040
#define S_IWGRP 0020
#define S_IXGRP 0010
#define S_IRWXO 0007
#define S_IROTH 0004
#define S_IWOTH 0002
#define S_IXOTH 0001

#define S_IFMT   0170000
#define S_IFDIR  0040000
#define S_IFREG  0100000
#define S_IFLNK  0120000
#define S_IFCHR  0020000
#define S_IFBLK  0060000
#define S_IFIFO  0010000
#define S_IFSOCK 0140000
#define S_ISUID  04000
#define S_ISGID  02000
#define S_ISVTX  01000
#define S_ISDIR(m)  (((m) & S_IFMT) == S_IFDIR)
#define S_ISREG(m)  (((m) & S_IFMT) == S_IFREG)
#define S_ISLNK(m)  (((m) & S_IFMT) == S_IFLNK)
#define S_ISCHR(m)  (((m) & S_IFMT) == S_IFCHR)
#define S_ISBLK(m)  (((m) & S_IFMT) == S_IFBLK)
#define S_ISFIFO(m) (((m) & S_IFMT) == S_IFIFO)
#define S_ISSOCK(m) (((m) & S_IFMT) == S_IFSOCK)

#include <time.h>   /* struct timespec (one definition; redefining it here
                       would collide with time.h at file scope) */
// 64-bit ABI: st_size, st_blocks and all timestamps are 64-bit so files can
// exceed 4 GiB and times can exceed 2038/2106. Fields are grouped 32-bit-first
// then 8-byte-aligned 64-bit, so there's no internal padding before the wide
// fields. The host's writeStatBuf MUST match this layout byte-for-byte (the
// offsets are pinned by the stdlib/stat_layout test). Under v3 storage these
// fields still carry 32-bit-range values (zero/sign-extended); v4 storage fills
// the full range. tv_nsec is 0 while storage is second-granularity.
struct stat {
  unsigned long st_dev;
  unsigned long st_ino;
  unsigned long st_mode;
  unsigned long st_nlink;
  unsigned long st_rdev;
  unsigned int  st_uid;
  unsigned int  st_gid;
  long          st_blksize;
  long long     st_size;
  long long     st_blocks;
  long long     st_atime;
  long long     st_mtime;
  long long     st_ctime;
  struct timespec st_atim;
  struct timespec st_mtim;
  struct timespec st_ctim;
};

__import int mkdir(const char *path, int mode);
__import int stat(const char *path, struct stat *buf);
__import int lstat(const char *path, struct stat *buf);
__import int fstat(int fd, struct stat *buf);

/* mknod: no device/special nodes on this fs — always fails. (Regular-file
   creation goes through open(); callers wanting FIFOs get pipes via pipe().) */
static inline int mknod(const char *path, mode_t mode, dev_t dev) {
  (void)path; (void)mode; (void)dev; return -1;
}

#include <sys/time.h>   /* __utime / __futime / gettimeofday */

#define UTIME_NOW  ((1l << 30) - 1l)
#define UTIME_OMIT ((1l << 30) - 2l)

/* utimensat()/futimens(): POSIX 2008 nanosecond-resolution time setting.
   tv_nsec may be UTIME_NOW (use current time) or UTIME_OMIT (leave that one
   unchanged). We honor both — UTIME_OMIT reads the current value via stat()/
   fstat() and writes it back. Sub-second precision is truncated to whole
   seconds (the filesystems here are second-granularity). dirfd is treated as
   AT_FDCWD; AT_SYMLINK_NOFOLLOW is moot (no symlinks). */
static inline int utimensat(int dirfd, const char *path, const struct timespec times[2], int flags) {
  time_t a, m;
  struct timeval now; gettimeofday(&now, 0);
  (void)dirfd; (void)flags;
  if (times == 0) { a = m = now.tv_sec; }
  else {
    a = (times[0].tv_nsec == UTIME_NOW) ? now.tv_sec : times[0].tv_sec;
    m = (times[1].tv_nsec == UTIME_NOW) ? now.tv_sec : times[1].tv_sec;
    if (times[0].tv_nsec == UTIME_OMIT || times[1].tv_nsec == UTIME_OMIT) {
      struct stat st;
      if (stat(path, &st) != 0) return -1;
      if (times[0].tv_nsec == UTIME_OMIT) a = st.st_atime;
      if (times[1].tv_nsec == UTIME_OMIT) m = st.st_mtime;
    }
  }
  return __utime(path, a, m);
}
static inline int futimens(int fd, const struct timespec times[2]) {
  time_t a, m;
  struct timeval now; gettimeofday(&now, 0);
  if (times == 0) { a = m = now.tv_sec; }
  else {
    a = (times[0].tv_nsec == UTIME_NOW) ? now.tv_sec : times[0].tv_sec;
    m = (times[1].tv_nsec == UTIME_NOW) ? now.tv_sec : times[1].tv_sec;
    if (times[0].tv_nsec == UTIME_OMIT || times[1].tv_nsec == UTIME_OMIT) {
      struct stat st;
      if (fstat(fd, &st) != 0) return -1;
      if (times[0].tv_nsec == UTIME_OMIT) a = st.st_atime;
      if (times[1].tv_nsec == UTIME_OMIT) m = st.st_mtime;
    }
  }
  return __futime(fd, a, m);
}
  `,
  "utime.h": `
#pragma once
#include <sys/time.h>   /* __utime + gettimeofday */
struct utimbuf { time_t actime; time_t modtime; };
/* Legacy POSIX utime(). A NULL times argument means "now". */
static inline int utime(const char *path, const struct utimbuf *times) {
  if (times == 0) { struct timeval now; gettimeofday(&now, 0); return __utime(path, now.tv_sec, now.tv_sec); }
  return __utime(path, times->actime, times->modtime);
}
  `,
  "sys/types.h": `
#pragma once
typedef long ssize_t;
typedef long long off_t;
typedef unsigned long size_t;
typedef int mode_t;
typedef int pid_t;
typedef unsigned int uid_t;
typedef unsigned int gid_t;
typedef unsigned long dev_t;
typedef unsigned long ino_t;
typedef long long time_t;
typedef unsigned long nlink_t;
typedef long long blkcnt_t;
typedef long blksize_t;
  `,
  "tgmath.h": `
#pragma once
#include <math.h>

/* Type-generic macros for <math.h> functions (C11 7.25) */
/* Each macro dispatches to the float variant for float arguments, */
/* and the double variant otherwise.                               */

/* Unary float/double */
#define fabs(x)      _Generic((x), float: fabsf,      default: fabs)(x)
#define ceil(x)      _Generic((x), float: ceilf,      default: ceil)(x)
#define floor(x)     _Generic((x), float: floorf,     default: floor)(x)
#define trunc(x)     _Generic((x), float: truncf,     default: trunc)(x)
#define nearbyint(x) _Generic((x), float: nearbyintf, default: nearbyint)(x)
#define rint(x)      _Generic((x), float: rintf,      default: rint)(x)
#define sqrt(x)      _Generic((x), float: sqrtf,      default: sqrt)(x)
#define sin(x)       _Generic((x), float: sinf,       default: sin)(x)
#define cos(x)       _Generic((x), float: cosf,       default: cos)(x)
#define tan(x)       _Generic((x), float: tanf,       default: tan)(x)
#define asin(x)      _Generic((x), float: asinf,      default: asin)(x)
#define acos(x)      _Generic((x), float: acosf,      default: acos)(x)
#define atan(x)      _Generic((x), float: atanf,      default: atan)(x)
#define sinh(x)      _Generic((x), float: sinhf,      default: sinh)(x)
#define cosh(x)      _Generic((x), float: coshf,      default: cosh)(x)
#define tanh(x)      _Generic((x), float: tanhf,      default: tanh)(x)
#define asinh(x)     _Generic((x), float: asinhf,     default: asinh)(x)
#define acosh(x)     _Generic((x), float: acoshf,     default: acosh)(x)
#define atanh(x)     _Generic((x), float: atanhf,     default: atanh)(x)
#define exp(x)       _Generic((x), float: expf,       default: exp)(x)
#define expm1(x)     _Generic((x), float: expm1f,     default: expm1)(x)
#define log(x)       _Generic((x), float: logf,       default: log)(x)
#define log2(x)      _Generic((x), float: log2f,      default: log2)(x)
#define log10(x)     _Generic((x), float: log10f,     default: log10)(x)
#define log1p(x)     _Generic((x), float: log1pf,     default: log1p)(x)
#define cbrt(x)      _Generic((x), float: cbrtf,      default: cbrt)(x)
#define round(x)     _Generic((x), float: roundf,     default: round)(x)

/* Binary float/double — dispatch on (x)+(y) so mixed float/double promotes */
#define fdim(x, y)      _Generic((x)+(y), float: fdimf,      default: fdim)(x, y)
#define fmin(x, y)      _Generic((x)+(y), float: fminf,      default: fmin)(x, y)
#define fmax(x, y)      _Generic((x)+(y), float: fmaxf,      default: fmax)(x, y)
#define copysign(x, y)  _Generic((x)+(y), float: copysignf,  default: copysign)(x, y)
#define fmod(x, y)      _Generic((x)+(y), float: fmodf,      default: fmod)(x, y)
#define pow(x, y)       _Generic((x)+(y), float: powf,       default: pow)(x, y)
#define atan2(y, x)     _Generic((y)+(x), float: atan2f,     default: atan2)(y, x)
#define hypot(x, y)     _Generic((x)+(y), float: hypotf,     default: hypot)(x, y)
#define nextafter(x, y) _Generic((x)+(y), float: nextafterf, default: nextafter)(x, y)

/* ldexp: second arg is always int, dispatch on first arg only */
#define ldexp(x, n)     _Generic((x), float: ldexpf,    default: ldexp)(x, n)
  `,
  "threads.h": `
#pragma once
#define thread_local _Thread_local
  `,
  "time.h": `
#pragma once
__require_source("__time.c");
#include <stddef.h>

typedef long long time_t;
typedef long clock_t;

struct tm {
  int tm_sec;
  int tm_min;
  int tm_hour;
  int tm_mday;
  int tm_mon;
  int tm_year;
  int tm_wday;
  int tm_yday;
  int tm_isdst;
  long tm_gmtoff;
};

struct timespec {
  long long tv_sec;   // 64-bit (matches struct stat's st_*tim); range past 2038
  long      tv_nsec;
};

typedef int clockid_t;
#define CLOCKS_PER_SEC 1000000
#define CLOCK_REALTIME 0
#define CLOCK_MONOTONIC 1

time_t time(time_t *t);
clock_t clock(void);
double difftime(time_t t1, time_t t0);
struct tm *gmtime(const time_t *timep);
struct tm *localtime(const time_t *timep);
struct tm *localtime_r(const time_t *timep, struct tm *result);
time_t mktime(struct tm *tm);
char *asctime(const struct tm *tm);
char *ctime(const time_t *timep);
size_t strftime(char *s, size_t max, const char *fmt, const struct tm *tm);
int clock_gettime(clockid_t clk_id, struct timespec *tp);
/* clock_settime: the wall clock belongs to the host/browser — a process
   cannot set it. Fails EPERM, like an unprivileged caller on POSIX. */
#include <errno.h>
static inline int clock_settime(clockid_t clk_id, const struct timespec *tp) {
  (void)clk_id; (void)tp; errno = EPERM; return -1;
}
__import int __nanosleep(long sec, long nsec);
static inline int nanosleep(const struct timespec *req, struct timespec *rem) {
  (void)rem;
  return __nanosleep(req->tv_sec, req->tv_nsec);
}
  `,
  "uchar.h": `
#pragma once
#include <stdint.h>
typedef uint_least16_t char16_t;
typedef uint_least32_t char32_t;
#define __STDC_UTF_16__ 1
#define __STDC_UTF_32__ 1
  `,
  "unistd.h": `
#pragma once
/* POSIX requires unistd.h to define size_t (and ssize_t/off_t). */
typedef unsigned long size_t;
typedef long ssize_t;
typedef long long off_t;
#define STDIN_FILENO  0
#define STDOUT_FILENO 1
#define STDERR_FILENO 2
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2
#define F_OK 0
#define R_OK 4
#define W_OK 2
#define X_OK 1
__import int close(int fd);
__import long read(int fd, void *buf, long count);
__import long write(int fd, const void *buf, long count);
__import long long lseek(int fd, long long offset, int whence);
__import char *getcwd(char *buf, long size);
__import int chdir(const char *path);
__import int access(const char *path, int mode);
__import int rmdir(const char *path);
__import int unlink(const char *path);
__import int pipe(int pipefd[2]);
__import int dup(int oldfd);
__import int dup2(int oldfd, int newfd);
__import int getpid(void);
__import int getppid(void);
__import int isatty(int fd);
__import int usleep(unsigned int usec);
/* wasm linear memory grows in 64KiB pages — that IS the page size here. */
static inline int getpagesize(void) { return 65536; }
__import int ftruncate(int fd, long long length);
__import long readlink(const char *path, char *buf, long bufsize);
__import int fsync(int fd);
__import int fdatasync(int fd);
/* sync(): whole-fs flush. Writes reach the backing store as they happen
   (BlockFS has no process-side dirty cache; per-fd durability is fsync),
   so there is nothing extra to flush from here — a no-op by design. */
static inline void sync(void) { }
__import int chmod(const char *path, int mode);
__import int fchmod(int fd, int mode);
__import int link(const char *oldpath, const char *newpath);
/* Ownership: single root user (uid/gid 0 everywhere, see getuid below) and
   the fs stores no owner metadata — "changing" ownership always succeeds. */
static inline int chown(const char *path, unsigned owner, unsigned group)  { (void)path; (void)owner; (void)group; return 0; }
static inline int lchown(const char *path, unsigned owner, unsigned group) { (void)path; (void)owner; (void)group; return 0; }
static inline int fchown(int fd, unsigned owner, unsigned group)           { (void)fd; (void)owner; (void)group; return 0; }
__import unsigned int sleep(unsigned int seconds);
__import int symlink(const char *target, const char *linkpath);
__import int chmod(const char *path, int mode);
__import char *realpath(const char *path, char *resolved);
extern char **environ;

/* ---- Owner-brokered process model (posix_spawn, NOT fork) ----
   Three low-level host imports the runtime brokers through its process kernel.
   The familiar POSIX surface (posix_spawn family, system, popen, waitpid, kill)
   is C built on top of these (see <spawn.h>/<sys/wait.h>). The host reads the
   spec struct straight from wasm memory at spawn time — fds are declarative
   (file_actions), because a child is a separate instance and cannot inherit fds
   by memory copy. */
struct __fd_action {            /* op: 0=DUP2 1=OPEN 2=CLOSE */
    int op; int fd; int arg; const char *path; int mode;
};
struct __spawn_spec {
    const char *path;           /* program image (a .wasm) */
    char *const *argv;          /* NULL-terminated */
    char *const *envp;          /* NULL => inherit (host walks __get_environ) */
    const char *cwd;            /* NULL => inherit */
    const struct __fd_action *actions;
    int n_actions;
    unsigned flags;             /* __SPAWN_* bits below */
    int pgid;
    int trace;                  /* strace (0046): pipe write-end fd, -1 = none.
                                   Read by the host ONLY under __SPAWN_TRACE
                                   (spec-grows-by-field compatibility). */
};
/* spec.flags bits. */
#define __SPAWN_SETPGID        1u  /* pgid field valid (0 = own pid) */
#define __SPAWN_TRACE          2u  /* trace field valid (todos/0046) */
#define __SPAWN_TRACE_CHILDREN 4u  /* trace descendants too (strace -f) */
__import int __spawn(const struct __spawn_spec *spec);        /* -> pid | -1+errno */
__import int __spawn_wait(int pid, int *status, int options); /* -> pid | -1+errno */
__import int __spawn_kill(int pid, int sig);                  /* -> 0   | -1+errno */
__import int __spawn_setpgid(int pid, int pgid);              /* -> 0   | -1+errno */
__import int __spawn_getpgid(int pid);                        /* -> pgid| -1+errno */
__import int __spawn_getsid(int pid);                         /* -> sid | -1+errno */
__import int __spawn_setsid(void);                            /* -> sid | -1+errno */
/* plain int like the imports above: pid_t's typedef comes later */
static inline int setpgid(int pid, int pgid) { return __spawn_setpgid(pid, pgid); }
static inline int getpgid(int pid)           { return __spawn_getpgid(pid); }
static inline int getpgrp(void)              { return __spawn_getpgid(0); }
static inline int getsid(int pid)            { return __spawn_getsid(pid); }
static inline int setsid(void)               { return __spawn_setsid(); }
/* Run the host's in-browser C compiler (it has no wasm image to exec). Packs the
   result into buf as: int exitCode, int outLen, int errLen, then outLen stdout
   bytes, then errLen stderr bytes. Returns total bytes written, or -1+errno
   (ENOMEM if buf is too small, ENOSYS without a host kernel). Used by /bin/cc so
   'cc' is a normal command a real shell can spawn. */
__import int __compile(const char *cwd, char *const *argv, char *buf, int cap);

// POSIX process management. No wasm host equivalent — all stubs fail.
#define _SC_OPEN_MAX 4
static inline int   fork(void)              { return -1; }
static inline int   execve(const char *p, char *const a[], char *const e[]) { (void)p; (void)a; (void)e; return -1; }
/* _exit: terminate WITHOUT atexit handlers / stdio flushing (KERNEL.md
   "Exit and teardown": same __exit handshake as exit(), minus step 1).
   Was a spin-forever stub from the pre-kernel era — hush's exit path hung
   on it (todos/0005). The loop after __exit only satisfies noreturn. */
__import void __exit(int status);
static inline void  _exit(int s)            { __exit(s); for (;;) {} }
static inline long  sysconf(int name)       { (void)name; return -1; }
static inline int   setuid(unsigned uid)    { (void)uid; return -1; }
static inline int   setgid(unsigned gid)    { (void)gid; return -1; }
/* kill() lives in __signal.c (declared in signal.h; declared here too for
   unistd-only callers): self-directed signals must deliver through the libc
   handler tables, not just the kernel RPC. __signal.c links into every
   stdlib program via abort(), so the symbol is always present. */
int kill(int __pid, int __sig);
/* alarm()/ualarm() are facades over the kernel's ITIMER_REAL (todos/0044,
   setitimer in <sys/time.h>); like kill(), the implementations live in
   __signal.c. Without a kernel they return 0 with errno ENOSYS. */
unsigned alarm(unsigned __seconds);
unsigned ualarm(unsigned __usecs, unsigned __interval);
/* Single root user: real and effective user/group IDs are all 0 (root).
   These never fail (POSIX getuid/getgid have no error return). */
static inline unsigned getuid(void)         { return 0; }
static inline unsigned geteuid(void)        { return 0; }
static inline unsigned getgid(void)         { return 0; }
static inline unsigned getegid(void)        { return 0; }
  `,
  "pwd.h": `
#pragma once
#include <sys/types.h>
#include <stddef.h>

/* Single-root-user password database. getpwuid/getpwnam return a static
   "root" entry (uid/gid 0, home /root, shell /bin/sh); anything else is NULL. */
struct passwd {
  char  *pw_name;
  char  *pw_passwd;
  uid_t  pw_uid;
  gid_t  pw_gid;
  char  *pw_gecos;
  char  *pw_dir;
  char  *pw_shell;
};

static inline struct passwd *getpwuid(uid_t uid) {
  static struct passwd root = { "root", "x", 0, 0, "root", "/root", "/bin/sh" };
  return uid == 0 ? &root : NULL;
}

static inline struct passwd *getpwnam(const char *name) {
  static struct passwd root = { "root", "x", 0, 0, "root", "/root", "/bin/sh" };
  if (!name) return NULL;
  /* tiny strcmp(name, "root") — avoids a <string.h> dependency in this header */
  const char *r = "root";
  while (*name && *name == *r) { name++; r++; }
  return (*name == 0 && *r == 0) ? &root : NULL;
}

/* Reentrant variants (used by e.g. glob's ~ expansion). On a match the
   caller's struct + buffer are filled with the root entry and *result points
   at pwd; on no match *result is NULL and the return is 0; ERANGE if buf is
   too small. */
static inline int __pwd_fill_root(struct passwd *pwd, char *buf, size_t buflen, struct passwd **result) {
  const char *fields[5] = { "root", "x", "root", "/root", "/bin/sh" };
  size_t need = 0;
  for (int i = 0; i < 5; i++) { const char *s = fields[i]; while (*s) { s++; need++; } need++; }
  if (buflen < need) { *result = (struct passwd *)0; return 34; /* ERANGE */ }
  char *p = buf; char *dst[5];
  for (int i = 0; i < 5; i++) { const char *s = fields[i]; dst[i] = p; while (*s) { *p++ = *s++; } *p++ = 0; }
  pwd->pw_name = dst[0]; pwd->pw_passwd = dst[1];
  pwd->pw_uid = 0; pwd->pw_gid = 0;
  pwd->pw_gecos = dst[2]; pwd->pw_dir = dst[3]; pwd->pw_shell = dst[4];
  *result = pwd;
  return 0;
}
static inline int getpwnam_r(const char *name, struct passwd *pwd, char *buf, size_t buflen, struct passwd **result) {
  if (!name) { *result = (struct passwd *)0; return 0; }
  const char *n = name; const char *r = "root";
  while (*n && *n == *r) { n++; r++; }
  if (*n != 0 || *r != 0) { *result = (struct passwd *)0; return 0; }
  return __pwd_fill_root(pwd, buf, buflen, result);
}
static inline int getpwuid_r(uid_t uid, struct passwd *pwd, char *buf, size_t buflen, struct passwd **result) {
  if (uid != 0) { *result = (struct passwd *)0; return 0; }
  return __pwd_fill_root(pwd, buf, buflen, result);
}
  `,
  "termios.h": `
#pragma once
#include <sys/types.h>

typedef unsigned int tcflag_t;
typedef unsigned char cc_t;
typedef unsigned int speed_t;

#define NCCS 20

struct termios {
  tcflag_t c_iflag;
  tcflag_t c_oflag;
  tcflag_t c_cflag;
  tcflag_t c_lflag;
  cc_t     c_cc[NCCS];
  speed_t  c_ispeed;
  speed_t  c_ospeed;
};

#define IGNBRK  0x00001
#define BRKINT  0x00002
#define IGNPAR  0x00004
#define PARMRK  0x00008
#define INPCK   0x00010
#define ISTRIP  0x00020
#define INLCR   0x00040
#define IGNCR   0x00080
#define ICRNL   0x00100
#define IXON    0x00200
#define IXOFF   0x00400
#define IXANY   0x00800
#define IMAXBEL 0x02000
#define IUTF8   0x04000

#define OPOST   0x00001
#define ONLCR   0x00002
#define OCRNL   0x00004

#define CSIZE   0x00300
#define CS5     0x00000
#define CS6     0x00100
#define CS7     0x00200
#define CS8     0x00300
#define CSTOPB  0x00400
#define CREAD   0x00800
#define PARENB  0x01000
#define PARODD  0x02000
#define HUPCL   0x04000
#define CLOCAL  0x08000

#define ECHOE   0x00002
#define ECHOK   0x00004
#define ECHO    0x00008
#define ECHONL  0x00010
#define ISIG    0x00080
#define ICANON  0x00100
#define IEXTEN  0x00400
#define TOSTOP  0x00800
#define NOFLSH  0x80000000

#define VEOF    0
#define VEOL    1
#define VERASE  3
#define VKILL   5
#define VINTR   8
#define VQUIT   9
#define VSUSP   10
#define VSTART  12
#define VSTOP   13
#define VMIN    16
#define VTIME   17

#define TCSANOW   0
#define TCSADRAIN 1
#define TCSAFLUSH 2

#define B0      0
#define B9600   9600
#define B19200  19200
#define B38400  38400
#define B115200 115200

/* Full-struct transfer (control chars included) — the host reads/writes the
   struct termios layout directly: 4 x u32 flags, c_cc[NCCS]@16, speeds@36/40.
   With kernel.js attached these are RPCs into the kernel's line discipline
   (todos/KERNEL.md Phase 3); without one, host defaults answer (canned
   values / the CLI's real terminal). The pgrp pair is ENOTTY without a
   kernel — no process groups to route to. */
__import int __tty_getattr(int fd, struct termios *t);
__import int __tty_setattr(int fd, int actions, const struct termios *t);
__import int __tty_getpgrp(int fd);
__import int __tty_setpgrp(int fd, int pgid);

static inline int tcgetattr(int fd, struct termios *t) {
  return __tty_getattr(fd, t);
}

static inline int tcsetattr(int fd, int actions, const struct termios *t) {
  return __tty_setattr(fd, actions, t);
}

static inline pid_t tcgetpgrp(int fd) { return (pid_t)__tty_getpgrp(fd); }
static inline int tcsetpgrp(int fd, pid_t pgrp) { return __tty_setpgrp(fd, (int)pgrp); }

static inline void cfmakeraw(struct termios *t) {
  t->c_iflag &= ~(IGNBRK | BRKINT | PARMRK | ISTRIP | INLCR | IGNCR | ICRNL | IXON);
  t->c_oflag &= ~OPOST;
  t->c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
  t->c_cflag &= ~(CSIZE | PARENB);
  t->c_cflag |= CS8;
  t->c_cc[VMIN] = 1;
  t->c_cc[VTIME] = 0;
}

static inline speed_t cfgetispeed(const struct termios *t) { return t->c_ispeed; }
static inline speed_t cfgetospeed(const struct termios *t) { return t->c_ospeed; }
static inline int cfsetispeed(struct termios *t, speed_t s) { t->c_ispeed = s; return 0; }
static inline int cfsetospeed(struct termios *t, speed_t s) { t->c_ospeed = s; return 0; }
  `,
  "sys/ioctl.h": `
#pragma once

#define TIOCGWINSZ 0x5413
#define TIOCSWINSZ 0x5414

struct winsize {
  unsigned short ws_row;
  unsigned short ws_col;
  unsigned short ws_xpixel;
  unsigned short ws_ypixel;
};

__import int __ioctl_tiocgwinsz(int fd, int *rows, int *cols);
__import int __ioctl_tiocswinsz(int fd, int rows, int cols);

static inline int ioctl(int fd, unsigned long request, void *arg) {
  if (request == TIOCGWINSZ) {
    struct winsize *ws = (struct winsize *)arg;
    int rows, cols;
    int r = __ioctl_tiocgwinsz(fd, &rows, &cols);
    if (r == 0) {
      ws->ws_row = (unsigned short)rows;
      ws->ws_col = (unsigned short)cols;
      ws->ws_xpixel = 0;
      ws->ws_ypixel = 0;
    }
    return r;
  }
  if (request == TIOCSWINSZ) {
    /* Pty resize (todos/0020): winsize words + SIGWINCH to the tty's
       foreground pgroup. Needs a kernel; ENOTTY elsewhere. */
    const struct winsize *ws = (const struct winsize *)arg;
    return __ioctl_tiocswinsz(fd, (int)ws->ws_row, (int)ws->ws_col);
  }
  return -1;
}
  `,
  "pty.h": `
#pragma once
/* Ptys over the kernel pty layer (todos/0020). openpty() creates a
   master/slave pair; the slave is a full kernel tty (line discipline,
   termios, job control), the master is the terminal application's end.
   termp/winp are accepted for API familiarity but the caller should
   tcsetattr/TIOCSWINSZ explicitly (name, termp, winp may be NULL). */
#include <termios.h>
#include <sys/ioctl.h>

__import int __openpty(int *amaster, int *aslave);

static inline int openpty(int *amaster, int *aslave, char *name,
                          const struct termios *termp,
                          const struct winsize *winp) {
  if (name) name[0] = '\\0';
  int r = __openpty(amaster, aslave);
  if (r != 0) return -1;
  if (termp) tcsetattr(*aslave, TCSANOW, termp);
  if (winp) ioctl(*amaster, TIOCSWINSZ, (void *)winp);
  return 0;
}
  `,
  "sys/wait.h": `
#pragma once
#include <sys/types.h>
#include <unistd.h>   // __spawn_wait (the owner-brokered process model)
#define WNOHANG    0x01
#define WUNTRACED  0x02
#define WCONTINUED 0x08
#define WIFEXITED(status)    (((status) & 0x7f) == 0)
#define WEXITSTATUS(status)  (((status) >> 8) & 0xff)
#define WIFSIGNALED(status)  (((status) & 0x7f) != 0 && ((status) & 0x7f) != 0x7f)
#define WTERMSIG(status)     ((status) & 0x7f)
#define WIFSTOPPED(status)   (((status) & 0xff) == 0x7f)
#define WSTOPSIG(status)     WEXITSTATUS(status)
#define WIFCONTINUED(status) ((status) == 0xffff)
// Reap a spawned child via the process kernel. status is POSIX-encoded:
// WEXITSTATUS(status) == child's exit code. waitpid(-1, ...) (any child) and
// the pgroup selectors (0 / -pgid) are supported by kernel.js; older external
// owner kernels may fail them with ECHILD.
static inline pid_t waitpid(pid_t pid, int *status, int options) {
  return __spawn_wait(pid, status, options);
}
static inline pid_t wait(int *status) { return waitpid(-1, status, 0); }
  `,
  "spawn.h": `
#pragma once
#include <sys/types.h>
#include <unistd.h>   // struct __spawn_spec / __fd_action / __spawn
#include <errno.h>
#include <stdlib.h>   // getenv (posix_spawnp PATH search)
#include <string.h>   // strchr/strlen/memcpy/strcpy

// posix_spawn over the owner-brokered process model. file_actions/attr marshal
// 1:1 into __spawn_spec (file_actions ARE the spec's actions); posix_spawn
// returns an errno value (0 = success), not -1. NOTE: file_actions (fd redirects)
// require the owner to apply them at spawn time — landing with fd portability;
// until then a child gets default fds.
typedef struct {
  struct __fd_action __acts[32];  // 32 redirections is plenty for a shell line
  int __n;
} posix_spawn_file_actions_t;

typedef struct {
  unsigned __flags;
  int __pgrp;
} posix_spawnattr_t;

#define POSIX_SPAWN_SETPGROUP 0x02

static inline int posix_spawn_file_actions_init(posix_spawn_file_actions_t *fa) { fa->__n = 0; return 0; }
static inline int posix_spawn_file_actions_destroy(posix_spawn_file_actions_t *fa) { (void)fa; return 0; }
static inline int posix_spawn_file_actions_adddup2(posix_spawn_file_actions_t *fa, int fd, int newfd) {
  if (fa->__n >= 32) return EINVAL;
  struct __fd_action *a = &fa->__acts[fa->__n++];
  a->op = 0; a->fd = newfd; a->arg = fd; a->path = 0; a->mode = 0;  // DUP2: fd -> newfd
  return 0;
}
static inline int posix_spawn_file_actions_addopen(posix_spawn_file_actions_t *fa, int fd, const char *path, int oflag, unsigned mode) {
  if (fa->__n >= 32) return EINVAL;
  struct __fd_action *a = &fa->__acts[fa->__n++];
  a->op = 1; a->fd = fd; a->arg = oflag; a->path = path; a->mode = (int)mode;  // OPEN at fd
  return 0;
}
static inline int posix_spawn_file_actions_addclose(posix_spawn_file_actions_t *fa, int fd) {
  if (fa->__n >= 32) return EINVAL;
  struct __fd_action *a = &fa->__acts[fa->__n++];
  a->op = 2; a->fd = fd; a->arg = 0; a->path = 0; a->mode = 0;  // CLOSE fd
  return 0;
}
static inline int posix_spawnattr_init(posix_spawnattr_t *a) { a->__flags = 0; a->__pgrp = 0; return 0; }
static inline int posix_spawnattr_destroy(posix_spawnattr_t *a) { (void)a; return 0; }
static inline int posix_spawnattr_setflags(posix_spawnattr_t *a, short f) { a->__flags = (unsigned)(unsigned short)f; return 0; }
static inline int posix_spawnattr_getflags(const posix_spawnattr_t *a, short *f) { if (f) *f = (short)a->__flags; return 0; }
static inline int posix_spawnattr_setpgroup(posix_spawnattr_t *a, int pg) { a->__pgrp = pg; return 0; }
static inline int posix_spawnattr_getpgroup(const posix_spawnattr_t *a, int *pg) { if (pg) *pg = a->__pgrp; return 0; }

static inline int posix_spawn(pid_t *pid, const char *path,
    const posix_spawn_file_actions_t *fa, const posix_spawnattr_t *attr,
    char *const argv[], char *const envp[]) {
  struct __spawn_spec spec;
  spec.path = path;
  spec.argv = argv;
  spec.envp = envp;          // NULL => inherit
  spec.cwd = 0;              // inherit the parent's cwd
  spec.actions = fa ? fa->__acts : (const struct __fd_action *)0;
  spec.n_actions = fa ? fa->__n : 0;
  spec.flags = (attr && (attr->__flags & POSIX_SPAWN_SETPGROUP)) ? __SPAWN_SETPGID : 0u;
  spec.pgid = attr ? attr->__pgrp : 0;
  spec.trace = -1;           /* no __SPAWN_TRACE bit — field ignored anyway */
  int r = __spawn(&spec);
  if (r < 0) return errno ? errno : ENOSYS;   // posix_spawn returns errno, not -1
  if (pid) *pid = r;
  return 0;
}
/* posix_spawnp: like execvp, resolve 'file' against $PATH unless it contains a
   slash. If nothing is found we still spawn 'file' so the child surfaces the
   exec failure as exit 127 (POSIX) rather than failing the spawn. */
static inline int posix_spawnp(pid_t *pid, const char *file,
    const posix_spawn_file_actions_t *fa, const posix_spawnattr_t *attr,
    char *const argv[], char *const envp[]) {
  if (!file || !*file) { errno = ENOENT; return ENOENT; }
  if (strchr(file, '/')) return posix_spawn(pid, file, fa, attr, argv, envp);
  const char *path = getenv("PATH");
  if (!path || !*path) path = "/bin:/usr/bin";
  char cand[1024];
  unsigned long flen = strlen(file);
  while (*path) {
    const char *colon = strchr(path, ':');
    unsigned long dlen = colon ? (unsigned long)(colon - path) : strlen(path);
    if (dlen + 1 + flen + 1 <= sizeof(cand)) {
      unsigned long k = 0;
      if (dlen == 0) { cand[k++] = '.'; } else { memcpy(cand, path, dlen); k = dlen; }
      cand[k++] = '/';
      strcpy(&cand[k], file);   /* &cand[k], not cand+k: avoid array-in-arithmetic warning */
      if (access(cand, 0 /* F_OK */) == 0) return posix_spawn(pid, cand, fa, attr, argv, envp);
    }
    if (!colon) break;
    path = colon + 1;
  }
  return posix_spawn(pid, file, fa, attr, argv, envp);  /* unfound → child exits 127 */
}
`,
  "guc.h": `
#ifndef _GUC_H
#define _GUC_H

__require_source("__guc.c");

__import("c", "__jsstr")
__externref __jsstr(const char *s);

__import("c", "__jsstr2")
__externref __jsstr2(const char *s, int len);

__import("c", "__jsgetattr")
__externref __jsgetattr(__externref obj, __externref key);

__import("c", "__jslog")
void __jslog(__externref val);

__import("c", "__jsglobal")
__externref __jsglobal(void);

__import("c", "__jsstr_utf8len")
int __jsstr_utf8len(__externref s);

__import("c", "__jsstr_read")
int __jsstr_read(__externref s, char *buf, int maxlen, int *written);

__import("wasm:js-string", "length")
int __wjs_length(__externref s);

__import("wasm:js-string", "charCodeAt")
int __wjs_charCodeAt(__externref s, int idx);

__import("wasm:js-string", "codePointAt")
int __wjs_codePointAt(__externref s, int idx);

__import("wasm:js-string", "equals")
int __wjs_equals(__externref a, __externref b);

__import("wasm:js-string", "compare")
int __wjs_compare(__externref a, __externref b);

__import("wasm:js-string", "concat")
__refextern __wjs_concat(__externref a, __externref b);

__import("wasm:js-string", "substring")
__refextern __wjs_substring(__externref s, int start, int end);

__import("wasm:js-string", "fromCharCode")
__refextern __wjs_fromCharCode(int code);

__import("wasm:js-string", "fromCodePoint")
__refextern __wjs_fromCodePoint(int codePoint);

__import("wasm:js-string", "test")
int __wjs_test(__externref val);

__import("wasm:js-string", "cast")
__refextern __wjs_cast(__externref val);

__externref __jss(const char *s);

/* Friendly spelling for the __gcstr keyword builtin: the literal as an
   imported externref constant (zero-copy, zero linear memory, deduped). */
#define GCSTR(s) __gcstr(s)

#endif
  `,
};

// Embedded standard library sources
const _stdlibSources = {
  "__guc.c": `
#include <string.h>
#include <guc.h>

__externref __jss(const char *s) {
    return __jsstr2(s, (int)strlen(s));
}
  `,
  "__SDL.c": `
#include <SDL.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdarg.h>
#include <math.h>

/* Opaque to user code (only the forward declaration is in SDL.h).
   'handle' is a 1-based index into the host's sdlWindows array.
   We reuse it as the SDL window ID (SDL_GetWindowID returns it,
   and event windowID fields carry it). This is fine because we
   control the entire stack — the real @kmamal/sdl window ID
   never leaks to C code. The struct + registry decl live in
   __SDL_internal.h since todos/0256 (shared with __SDL_popup.c). */
#include <__SDL_internal.h>

/* Window registry: __sdl_push_window_event must find the SDL_Window by
   handle to re-derive its surface on RESIZED (todos/0019). Windows are
   few; a small fixed table with linear scans is fine. A window past the
   cap still works — it just never re-derives on resize. The ARRAY is
   non-static since todos/0256 (declared in __SDL_internal.h): the popup TU
   registers its windows by slotting into it directly, so RESIZED
   re-derivation covers popups too — while the register/unregister/lookup
   helpers stay static (a second reference would defeat their single-use
   inlining and change every SDL binary's bytes; the interlock forbids it). */
SDL_Window *__sdl_window_registry[__SDL_MAX_WINDOWS];

static void __sdl_window_register(SDL_Window *w) {
    for (int i = 0; i < __SDL_MAX_WINDOWS; i++) {
        if (!__sdl_window_registry[i]) { __sdl_window_registry[i] = w; return; }
    }
}

static void __sdl_window_unregister(SDL_Window *w) {
    for (int i = 0; i < __SDL_MAX_WINDOWS; i++) {
        if (__sdl_window_registry[i] == w) { __sdl_window_registry[i] = 0; return; }
    }
}

static SDL_Window *__sdl_window_by_handle(int handle) {
    for (int i = 0; i < __SDL_MAX_WINDOWS; i++) {
        SDL_Window *w = __sdl_window_registry[i];
        if (w && w->handle == handle) return w;
    }
    return 0;
}

/* Low-level host imports — all operate on primitive values only.
   The host (host.js) knows nothing about C struct layouts. */
__import int __sdl_init(int flags);
__import void __sdl_quit(void);
__import int __sdl_create_window(const char *title, int x, int y, int w, int h, int flags);
__import void __sdl_destroy_window(int handle);
__import void __sdl_set_window_title(int handle, const char *title);
__import void __sdl_set_relative_mouse_mode(int handle, int enabled);
/* Per-surface cursor (todos/0105): shape is an SDL_SystemCursor value, or
   -1 to hide (CSS cursor:none). handle names the process's window. */
__import void __sdl_set_cursor(int handle, int shape);
__import int __sdl_set_window_size(int handle, int w, int h);
__import int __sdl_update_window_surface(int handle, const void *pixels, int w, int h, int pitch);
__import void __sdl_delay(int ms);
/* Blocking input park (todos/0161; host.js pumpWait — the same seam user32's
   GetMessage uses): drain the OS input ring into the wasm event queue and, if
   dry, park on the ring until the kernel's next push or timeoutMs. Returns 1
   if a ring exists (a window was created), 0 otherwise (caller paces itself).
   Wakes can be spurious; callers re-poll their queues. */
__import int __sdl_pump_wait(int timeoutMs);
/* libc's sleep import (this unit doesn't include time.h) — the no-ring
   fallback pace in SDL_WaitEventTimeout. */
__import int __nanosleep(long sec, long nsec);
/* ms since SDL_Init as an f64 (exact for integer ms up to 2^53 — ~285k years),
   so SDL_GetTicks can return a full Uint64 without the old 32-bit wrap. */
__import double __sdl_get_ticks(void);
__import void __sdl_set_animation_frame_func(void (*callback)(void));
/* System clipboard (todos/0090; host.js createClipboard). */
__import int __clip_set(int fmt, const void *bytes, int len);
__import int __clip_get(int fmt, void *out, int cap);
/* HTTP transport (todos/0172; host.js createHttp). The libcurl veneer
   (0173) and /bin/code (0174) sit on these. headers is a NUL-terminated
   blob of "Name: Value" lines joined by newlines (or empty). */
__import int __http_open(const char *method, const char *url, const char *headers, const void *body, int blen);
__import int __http_status(int id, int *status_out, char *hdr, int hdrcap);
__import int __http_read(int id, void *buf, int cap);
__import int __http_close(int id);
__import int __sdl_open_audio_device(int freq, int format, int channels);
__import int __sdl_queue_audio(int dev, const void *data, int len);
__import int __sdl_get_queued_audio_size(int dev);
__import void __sdl_clear_queued_audio(int dev);
__import void __sdl_pause_audio_device(int dev, int pause_on);
__import void __sdl_close_audio_device(int dev);
/* Throws (fail-loud) — the SDL_AudioStream get-callback / pull mode has no
   honourable implementation here (no audio thread to call it). */
__import void __sdl_audio_callback_unsupported(void);

/* SDL_Renderer primitives. Colors are 0..1 floats; the single draw primitive
   takes 4 dst corners (TL,TR,BR,BL in pixels) + a src rect (texture pixels). */
__import int  __sdl_create_renderer(int window);
__import void __sdl_destroy_renderer(int r);
__import int  __sdl_create_texture(int r, int access, int w, int h);
__import void __sdl_destroy_texture(int t);
__import void __sdl_update_texture(int t, const void *pixels, int pitch, int x, int y, int w, int h);
__import void __sdl_set_texture_color_mod(int t, double r, double g, double b);
__import void __sdl_set_texture_alpha_mod(int t, double a);
__import void __sdl_set_texture_blend_mode(int t, int mode);
__import int __sdl_get_texture_blend_mode(int t);
__import void __sdl_set_texture_scale_mode(int t, int mode);
__import int __sdl_get_texture_scale_mode(int t);
__import void __sdl_set_draw_color(int r, double rr, double gg, double bb, double aa);
__import void __sdl_set_draw_blend_mode(int r, int mode);
__import void __sdl_render_clear(int r);
__import void __sdl_render_quad(int r, int texH, double x0, double y0, double x1, double y1, double x2, double y2, double x3, double y3, double sx, double sy, double sw, double sh);
__import void __sdl_render_geometry(int r, int texH, const float *verts, int vertCount);
__import void __sdl_render_present(int r);

/* ---- Error handling ----
   Single-threaded runtime ⇒ one global error buffer. SDL_GetError returns it
   verbatim (empty string, never NULL, when no error is set). SDL_SetError
   formats with vsnprintf and returns false; SDL_ClearError returns true. */
static char __sdl_error[1024];

const char *SDL_GetError(void) {
    return __sdl_error;
}

bool SDL_SetError(const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(__sdl_error, sizeof(__sdl_error), fmt, ap);
    va_end(ap);
    return 0;   /* SDL3 convention: SDL_SetError always returns false */
}

bool SDL_ClearError(void) {
    __sdl_error[0] = '\\0';
    return 1;   /* SDL3 convention: SDL_ClearError always returns true */
}

/* Subsystems this runtime actually backs: VIDEO (WebGPU canvas), AUDIO (Web
   Audio), and EVENTS (the event queue needs no device). Joystick/haptic/gamepad/
   sensor/camera have no backend yet, so SDL_Init FAILS LOUD on them rather than
   pretending it initialized (Guiding principle 1: behave like SDL or fail loud).
   When iOS/gamepad support lands, widen this mask. */
#define __SDL_SUPPORTED_SUBSYSTEMS (SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_EVENTS)

static SDL_InitFlags __sdl_initted = 0;
/* Whether the host __sdl_init (which baselines the SDL_GetTicks clock) has run
   this init cycle. Tracked separately from the subsystem mask: keying the
   one-time baseline on (__sdl_initted == 0) was wrong because SDL_Init(0) leaves
   the mask 0, so a subsequent SDL_Init would re-call the host and reset ticks. */
static bool __sdl_host_inited = 0;

static bool __sdl_do_init(SDL_InitFlags flags) {
    SDL_InitFlags unsupported = flags & ~(SDL_InitFlags)__SDL_SUPPORTED_SUBSYSTEMS;
    if (unsupported) {
        return SDL_SetError(
            "SDL_Init: requested subsystem(s) 0x%X are not supported by this runtime "
            "(supported: SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_EVENTS). "
            "Joystick/gamepad/haptic/sensor/camera have no web backend yet.",
            (unsigned)unsupported);
    }
    /* SDL implicitly brings up EVENTS alongside VIDEO/AUDIO. */
    if (flags & (SDL_INIT_VIDEO | SDL_INIT_AUDIO)) flags |= SDL_INIT_EVENTS;
    /* Baseline the tick clock exactly once per init cycle. */
    if (!__sdl_host_inited) { __sdl_init((int)flags); __sdl_host_inited = 1; }
    __sdl_initted |= flags;
    return 1;
}

bool SDL_Init(SDL_InitFlags flags) {
    return __sdl_do_init(flags);
}

bool SDL_InitSubSystem(SDL_InitFlags flags) {
    return __sdl_do_init(flags);
}

void SDL_QuitSubSystem(SDL_InitFlags flags) {
    __sdl_initted &= ~flags;
}

SDL_InitFlags SDL_WasInit(SDL_InitFlags flags) {
    /* SDL3: flags==0 returns the full initialized mask; otherwise the subset. */
    return flags ? (__sdl_initted & flags) : __sdl_initted;
}

SDL_Window *SDL_CreateWindow(const char *title, int w, int h, SDL_WindowFlags flags) {
    /* SDL3 dropped the x,y args; the host centers the window, so pass 0,0. */
    int handle = __sdl_create_window(title, 0, 0, w, h, (int)flags);
    if (handle <= 0) { SDL_SetError("SDL_CreateWindow: host failed to create a window"); return NULL; }
    int pitch = w * 4;
    SDL_Window *win = (SDL_Window *)malloc(sizeof(SDL_Window));
    if (!win) { SDL_SetError("Out of memory"); return NULL; }
    win->handle = handle;
    win->surface.flags = 0;
    win->surface.format = SDL_PIXELFORMAT_RGBA32;
    win->surface.w = w;
    win->surface.h = h;
    win->surface.pitch = pitch;
    win->surface.refcount = 1;
    win->surface.reserved = NULL;
    win->surface.pixels = malloc(pitch * h);
    if (!win->surface.pixels) { free(win); SDL_SetError("Out of memory"); return NULL; }
    memset(win->surface.pixels, 0, pitch * h);
    win->pixels_cap = pitch * h;
    win->relative_mouse = 0;
    __sdl_window_register(win);
    return win;
}

SDL_WindowID SDL_GetWindowID(SDL_Window *window) {
    if (!window) { SDL_InvalidParamError("window"); return 0; }
    return (SDL_WindowID)window->handle;
}

SDL_Surface *SDL_GetWindowSurface(SDL_Window *window) {
    if (!window) { SDL_InvalidParamError("window"); return NULL; }
    return &window->surface;
}

bool SDL_GetWindowSize(SDL_Window *window, int *w, int *h) {
    if (!window) return SDL_InvalidParamError("window");
    /* The surface tracks the window size (resize events re-derive it). */
    if (w) *w = window->surface.w;
    if (h) *h = window->surface.h;
    return 1;
}

/* Ask the window system for a new size (todos/0068). ASYNC like upstream
   SDL3 under a real WM: success means the request was accepted; the actual
   size change arrives as SDL_EVENT_WINDOW_RESIZED (which re-derives the
   window surface in place — see __sdl_push_window_event). Only the
   kernel-surface runtime honours it; elsewhere this fails loud. */
bool SDL_SetWindowSize(SDL_Window *window, int w, int h) {
    if (!window) return SDL_InvalidParamError("window");
    if (w < 1 || h < 1)
        return SDL_SetError("SDL_SetWindowSize: invalid size %dx%d", w, h);
    if (__sdl_set_window_size(window->handle, w, h) != 0)
        return SDL_SetError("SDL_SetWindowSize: this runtime cannot resize the window");
    return 1;
}

bool SDL_UpdateWindowSurface(SDL_Window *window) {
    if (!window) return SDL_InvalidParamError("window");
    SDL_Surface *s = &window->surface;
    if (__sdl_update_window_surface(window->handle, s->pixels, s->w, s->h, s->pitch) != 0)
        return SDL_SetError("SDL_UpdateWindowSurface: the window has no surface to present");
    return 1;
}

/* ---- Event queue (freelist-based linked list) ---- */

typedef struct __SDL_EventEntry {
    SDL_Event event;
    struct __SDL_EventEntry *next;
} __SDL_EventEntry;

static __SDL_EventEntry *__sdl_eq_head;
static __SDL_EventEntry *__sdl_eq_tail;
static __SDL_EventEntry *__sdl_eq_free;

static __SDL_EventEntry *__sdl_eq_alloc(void) {
    __SDL_EventEntry *e = __sdl_eq_free;
    if (e) {
        __sdl_eq_free = e->next;
    } else {
        e = (__SDL_EventEntry *)malloc(sizeof(__SDL_EventEntry));
    }
    e->next = 0;
    return e;
}

static void __sdl_eq_push(__SDL_EventEntry *e) {
    if (__sdl_eq_tail) {
        __sdl_eq_tail->next = e;
    } else {
        __sdl_eq_head = e;
    }
    __sdl_eq_tail = e;
}

/* Event field population. The host passes DOM-derived primitives (scancode/sym,
   key mod + repeat, button, float coords, motion button-mask state, wheel
   direction); everything else SDL stamps itself — timestamp (SDL_GetTicksNS),
   the device 'which' id, relative motion (xrel/yrel), button click-count, and
   the wheel's mouse position — which we derive here so the SDL_Event matches
   upstream's populated fields, not a memset-zeroed shell. */

/* SDL stamps every event with SDL_GetTicksNS(). We have ms (sub-ms precise via
   performance.now()); ns = ms * 1e6. */
static Uint64 __sdl_now_ns(void) { return (Uint64)(__sdl_get_ticks() * 1000000.0); }

/* Single mouse / keyboard in this runtime; SDL uses a nonzero instance id (0 is
   not a valid SDL device id). */
#define __SDL_MOUSE_ID 1u
#define __SDL_KEYBOARD_ID 1u

/* Tracked to derive xrel/yrel, the wheel's mouse_x/y, and the click count. */
static float __sdl_mx = 0, __sdl_my = 0;
static bool __sdl_have_mpos = 0;
static Uint64 __sdl_last_click_ns = 0;
static int __sdl_last_click_btn = 0;
static float __sdl_last_click_x = 0, __sdl_last_click_y = 0;
static Uint8 __sdl_click_count = 0;

void __sdl_push_quit_event(int window_id) {
    /* The kernel's close request names a surface (the QUIT ring record
       carries the sid; the host maps it to our handle). With several
       windows live, deliver a per-window SDL_EVENT_WINDOW_CLOSE_REQUESTED
       so a multi-window app (the user32 veneer) closes just that window
       (todos/0089). The only/last window keeps the historical process-wide
       SDL_EVENT_QUIT. Divergence from upstream SDL3 (which sends
       CLOSE_REQUESTED and then QUIT for the last window) is deliberate:
       one event per request, so a queued pair can't double-close. */
    int live = 0;
    for (int i = 0; i < __SDL_MAX_WINDOWS; i++)
        if (__sdl_window_registry[i]) live++;
    __SDL_EventEntry *e = __sdl_eq_alloc();
    memset(&e->event, 0, sizeof(SDL_Event));
    if (live > 1 && __sdl_window_by_handle(window_id)) {
        e->event.type = SDL_EVENT_WINDOW_CLOSE_REQUESTED;
        e->event.window.timestamp = __sdl_now_ns();
        e->event.window.windowID = (SDL_WindowID)window_id;
    } else {
        e->event.type = SDL_EVENT_QUIT;
        e->event.common.timestamp = __sdl_now_ns();
    }
    __sdl_eq_push(e);
}
__export __sdl_push_quit_event = __sdl_push_quit_event;

/* Kernel-WM window events (todos/0019). RESIZED re-derives the window
   surface IN PLACE before the event is queued: w/h/pitch update, but the
   pixel allocation only ever GROWS (high-water) — a program that keeps
   drawing with stale dimensions writes inside the allocation instead of
   corrupting the heap. Per the SDL3 contract, programs should re-fetch
   SDL_GetWindowSurface after a resize event (same pointer here; fields
   are current either way). */
void __sdl_push_window_event(int window_id, int type, int data1, int data2) {
    if (type == SDL_EVENT_WINDOW_RESIZED && data1 > 0 && data2 > 0) {
        SDL_Window *w = __sdl_window_by_handle(window_id);
        if (w) {
            int pitch = data1 * 4;
            int need = pitch * data2;
            if (need > w->pixels_cap) {
                void *np = realloc(w->surface.pixels, (size_t)need);
                if (!np) return;           /* can't grow: drop the event */
                w->surface.pixels = np;
                w->pixels_cap = need;
            }
            w->surface.w = data1;
            w->surface.h = data2;
            w->surface.pitch = pitch;
            memset(w->surface.pixels, 0, (size_t)need);
        }
    }
    __SDL_EventEntry *e = __sdl_eq_alloc();
    memset(&e->event, 0, sizeof(SDL_Event));
    e->event.type = (Uint32)type;
    e->event.window.timestamp = __sdl_now_ns();
    e->event.window.windowID = (SDL_WindowID)window_id;
    e->event.window.data1 = data1;
    e->event.window.data2 = data2;
    __sdl_eq_push(e);
}
__export __sdl_push_window_event = __sdl_push_window_event;

void __sdl_push_key_event(int window_id, int type, int scancode, int sym, int mod, int repeat) {
    __SDL_EventEntry *e = __sdl_eq_alloc();
    memset(&e->event, 0, sizeof(SDL_Event));
    e->event.type = (Uint32)type;
    e->event.key.timestamp = __sdl_now_ns();
    e->event.key.windowID = (SDL_WindowID)window_id;
    e->event.key.which = __SDL_KEYBOARD_ID;
    e->event.key.down = (type == SDL_EVENT_KEY_DOWN);
    e->event.key.repeat = repeat ? 1 : 0;
    e->event.key.scancode = (SDL_Scancode)scancode;
    e->event.key.key = (SDL_Keycode)sym;
    e->event.key.mod = (SDL_Keymod)mod;
    __sdl_eq_push(e);
}
__export __sdl_push_key_event = __sdl_push_key_event;

void __sdl_push_mouse_button_event(int window_id, int type, int button, double x, double y) {
    __SDL_EventEntry *e = __sdl_eq_alloc();
    memset(&e->event, 0, sizeof(SDL_Event));
    bool down = (type == SDL_EVENT_MOUSE_BUTTON_DOWN);
    Uint64 now = __sdl_now_ns();
    if (down) {
        /* Click-count: consecutive presses of the same button within 500 ms and a
           small radius accumulate (double/triple click), else reset to 1. SDL
           never reports clicks == 0. */
        if (button == __sdl_last_click_btn &&
            now - __sdl_last_click_ns <= 500000000ULL &&
            fabs(x - __sdl_last_click_x) <= 32.0 &&
            fabs(y - __sdl_last_click_y) <= 32.0) {
            __sdl_click_count++;
        } else {
            __sdl_click_count = 1;
        }
        __sdl_last_click_ns = now;
        __sdl_last_click_btn = button;
        __sdl_last_click_x = (float)x;
        __sdl_last_click_y = (float)y;
    }
    e->event.type = (Uint32)type;
    e->event.button.timestamp = now;
    e->event.button.windowID = (SDL_WindowID)window_id;
    e->event.button.which = __SDL_MOUSE_ID;
    e->event.button.button = (Uint8)button;
    e->event.button.down = down;
    e->event.button.clicks = __sdl_click_count ? __sdl_click_count : 1;
    e->event.button.x = (float)x;
    e->event.button.y = (float)y;
    __sdl_mx = (float)x; __sdl_my = (float)y; __sdl_have_mpos = 1;
    __sdl_eq_push(e);
}
__export __sdl_push_mouse_button_event = __sdl_push_mouse_button_event;

void __sdl_push_mouse_motion_event(int window_id, double x, double y, int state) {
    __SDL_EventEntry *e = __sdl_eq_alloc();
    memset(&e->event, 0, sizeof(SDL_Event));
    float fx = (float)x, fy = (float)y;
    float xrel = 0, yrel = 0;
    if (__sdl_have_mpos) { xrel = fx - __sdl_mx; yrel = fy - __sdl_my; }
    __sdl_mx = fx; __sdl_my = fy; __sdl_have_mpos = 1;
    e->event.type = SDL_EVENT_MOUSE_MOTION;
    e->event.motion.timestamp = __sdl_now_ns();
    e->event.motion.windowID = (SDL_WindowID)window_id;
    e->event.motion.which = __SDL_MOUSE_ID;
    e->event.motion.state = (Uint32)state;
    e->event.motion.x = fx;
    e->event.motion.y = fy;
    e->event.motion.xrel = xrel;
    e->event.motion.yrel = yrel;
    __sdl_eq_push(e);
}
__export __sdl_push_mouse_motion_event = __sdl_push_mouse_motion_event;

/* Relative-mode motion (todos/0018): the host passes TRUE deltas (pointer-lock
   movementX/Y or an injected rel record) — x/y stay at the last tracked
   position (SDL3 semantics: the position freezes while relative mode is on)
   and the tracked position is NOT advanced by deltas. */
void __sdl_push_mouse_motion_rel_event(int window_id, double dx, double dy, int state) {
    __SDL_EventEntry *e = __sdl_eq_alloc();
    memset(&e->event, 0, sizeof(SDL_Event));
    e->event.type = SDL_EVENT_MOUSE_MOTION;
    e->event.motion.timestamp = __sdl_now_ns();
    e->event.motion.windowID = (SDL_WindowID)window_id;
    e->event.motion.which = __SDL_MOUSE_ID;
    e->event.motion.state = (Uint32)state;
    e->event.motion.x = __sdl_mx;
    e->event.motion.y = __sdl_my;
    e->event.motion.xrel = (float)dx;
    e->event.motion.yrel = (float)dy;
    __sdl_eq_push(e);
}
__export __sdl_push_mouse_motion_rel_event = __sdl_push_mouse_motion_rel_event;

void __sdl_push_mouse_wheel_event(int window_id, double x, double y, int direction) {
    __SDL_EventEntry *e = __sdl_eq_alloc();
    memset(&e->event, 0, sizeof(SDL_Event));
    e->event.type = SDL_EVENT_MOUSE_WHEEL;
    e->event.wheel.timestamp = __sdl_now_ns();
    e->event.wheel.windowID = (SDL_WindowID)window_id;
    e->event.wheel.which = __SDL_MOUSE_ID;
    e->event.wheel.x = (float)x;
    e->event.wheel.y = (float)y;
    e->event.wheel.direction = (Uint32)direction;
    /* SDL fills the wheel event with the current mouse position. */
    e->event.wheel.mouse_x = __sdl_mx;
    e->event.wheel.mouse_y = __sdl_my;
    __sdl_eq_push(e);
}
__export __sdl_push_mouse_wheel_event = __sdl_push_mouse_wheel_event;

bool SDL_PollEvent(SDL_Event *event) {
    __SDL_EventEntry *e = __sdl_eq_head;
    if (!e) return 0;
    /* SDL3: a NULL event peeks — return true if one is queued, but do NOT remove
       it from the queue (and never dereference the NULL pointer). */
    if (!event) return 1;
    __sdl_eq_head = e->next;
    if (!__sdl_eq_head) __sdl_eq_tail = 0;
    *event = e->event;
    e->next = __sdl_eq_free;
    __sdl_eq_free = e;
    return 1;
}

/* SDL_WaitEvent / SDL_WaitEventTimeout (todos/0161, IDLE-POWER Stage 2 —
   the real SDL idiom for event-driven apps: block, don't poll).
   Parks on the OS input ring via __sdl_pump_wait (host.js pumpWait, the seam
   user32's blocking GetMessage has used since 0058), so a waiting app is off
   the vsync heartbeat entirely: the kernel wakes it on routed input, resize,
   quit — never 60x/s for nothing. The park is CHUNKED at 1s per import call
   because an env-import RETURN is the cooperative-signal safe point; one
   unbounded park would defer SIGTERM and friends forever. Each chunk wake
   re-polls and re-parks, so an idle waiter costs ~1 wakeup/s.
   SDL3 semantics kept: a NULL event peeks (the event stays queued for the
   next SDL_PollEvent); timeoutMS < 0 waits forever; returns false on timeout.
   Without an input ring (no window yet, or a flavor with no kernel behind
   it) there is nothing to park on — nanosleep the chunk so the timeout
   semantics hold instead of a hot spin. */
bool SDL_WaitEventTimeout(SDL_Event *event, Sint32 timeoutMS) {
    Uint64 deadline = 0;
    if (timeoutMS > 0) deadline = SDL_GetTicks() + (Uint64)timeoutMS;
    for (;;) {
        if (SDL_PollEvent(event)) return 1;
        if (timeoutMS == 0) return 0;
        int chunk = 1000;
        if (timeoutMS > 0) {
            Uint64 now = SDL_GetTicks();
            if (now >= deadline) return 0;
            Uint64 left = deadline - now;
            if (left < (Uint64)chunk) chunk = (int)left;
        }
        if (!__sdl_pump_wait(chunk))
            __nanosleep(chunk / 1000, (long)(chunk % 1000) * 1000000L);
    }
}

bool SDL_WaitEvent(SDL_Event *event) {
    return SDL_WaitEventTimeout(event, -1);
}

/* ---- Audio ----
   SDL3 replaced the SDL2 device + queue API with SDL_AudioStream. We keep the
   host's primitive __sdl_* audio imports (one device == one ring) and model a
   stream as a thin wrapper over a device id. Push-only: the optional stream
   callback is ignored (NULL is the idiomatic SDL3 push path). SDL3 streams
   start paused, so callers must SDL_ResumeAudioStreamDevice to hear output —
   same as the old SDL_PauseAudioDevice(dev, 0). */
struct SDL_AudioStream {
    int dev;
    /* Overflow buffer: bytes the host ring couldn't accept yet. SDL_AudioStream is
       an UNBOUNDED queue (src/audio/SDL_audioqueue.c grows new tracks rather than
       dropping), so we must never drop — what doesn't fit the fixed SAB ring is
       held here and pumped into the ring on the next Put as the audio thread
       drains it. Preserves FIFO order; SDL_PutAudioStreamData always succeeds. */
    unsigned char *backlog;
    int backlog_len;
    int backlog_cap;
};

/* Push as much of the backlog into the host ring as it will currently accept,
   then compact the remainder to the front. __sdl_queue_audio returns the number
   of bytes the ring actually accepted. */
static void __sdl_stream_pump(SDL_AudioStream *s) {
    if (s->backlog_len <= 0) return;
    int accepted = __sdl_queue_audio(s->dev, s->backlog, s->backlog_len);
    if (accepted <= 0) return;
    if (accepted >= s->backlog_len) { s->backlog_len = 0; return; }
    memmove(s->backlog, s->backlog + accepted, (size_t)(s->backlog_len - accepted));
    s->backlog_len -= accepted;
}

SDL_AudioStream *SDL_OpenAudioDeviceStream(SDL_AudioDeviceID devid,
                                           const SDL_AudioSpec *spec,
                                           SDL_AudioStreamCallback callback,
                                           void *userdata) {
    (void)devid; (void)userdata;
    if (!spec) { SDL_SetError("SDL_OpenAudioDeviceStream: a NULL spec (device default) is not supported by this runtime"); return NULL; }
    /* A non-NULL callback selects SDL's get-callback (pull) mode: SDL would call
       it from its own audio thread to fetch samples. There is no such thread here
       (audio is driven from the main thread via Web Audio), so this can't be
       honoured — fail loud rather than silently fall back to push mode and play
       silence. The host throw explains the push-mode alternative. */
    if (callback) { __sdl_audio_callback_unsupported(); return NULL; }
    int dev = __sdl_open_audio_device(spec->freq, spec->format, spec->channels);
    if (dev <= 0) { SDL_SetError("SDL_OpenAudioDeviceStream: host failed to open an audio device"); return NULL; }
    SDL_AudioStream *s = (SDL_AudioStream *)malloc(sizeof(SDL_AudioStream));
    if (!s) { SDL_SetError("Out of memory"); return NULL; }
    s->dev = dev;
    s->backlog = NULL;
    s->backlog_len = 0;
    s->backlog_cap = 0;
    return s;
}

bool SDL_PutAudioStreamData(SDL_AudioStream *stream, const void *buf, int len) {
    if (!stream) return SDL_InvalidParamError("stream");
    if (len <= 0) return 1;
    /* Drain any backlog first so the ring is as empty as possible. */
    __sdl_stream_pump(stream);
    int accepted = 0;
    /* Only write the new data straight to the ring if the backlog is empty —
       otherwise it would jump ahead of already-queued samples (FIFO violation). */
    if (stream->backlog_len == 0) {
        accepted = __sdl_queue_audio(stream->dev, buf, len);
        if (accepted < 0) accepted = 0;
    }
    if (accepted < len) {
        int rem = len - accepted;
        if (stream->backlog_len + rem > stream->backlog_cap) {
            int newcap = stream->backlog_cap ? stream->backlog_cap : 65536;
            while (newcap < stream->backlog_len + rem) newcap *= 2;
            unsigned char *nb = (unsigned char *)realloc(stream->backlog, (size_t)newcap);
            if (!nb) return SDL_SetError("Out of memory");
            stream->backlog = nb;
            stream->backlog_cap = newcap;
        }
        memcpy(stream->backlog + stream->backlog_len, (const unsigned char *)buf + accepted, (size_t)rem);
        stream->backlog_len += rem;
    }
    return 1;
}

int SDL_GetAudioStreamQueued(SDL_AudioStream *stream) {
    if (!stream) { SDL_InvalidParamError("stream"); return -1; }
    int ring = __sdl_get_queued_audio_size(stream->dev);
    if (ring < 0) ring = 0;
    return ring + stream->backlog_len;
}

bool SDL_ClearAudioStream(SDL_AudioStream *stream) {
    if (!stream) return SDL_InvalidParamError("stream");
    stream->backlog_len = 0;
    __sdl_clear_queued_audio(stream->dev);
    return 1;
}

bool SDL_ResumeAudioStreamDevice(SDL_AudioStream *stream) {
    if (!stream) return SDL_InvalidParamError("stream");
    __sdl_pause_audio_device(stream->dev, 0);
    return 1;
}

bool SDL_PauseAudioStreamDevice(SDL_AudioStream *stream) {
    if (!stream) return SDL_InvalidParamError("stream");
    __sdl_pause_audio_device(stream->dev, 1);
    return 1;
}

void SDL_DestroyAudioStream(SDL_AudioStream *stream) {
    if (!stream) return;
    free(stream->backlog);
    __sdl_close_audio_device(stream->dev);
    free(stream);
}

void SDL_DestroyWindow(SDL_Window *window) {
    if (!window) return;
    __sdl_window_unregister(window);
    __sdl_destroy_window(window->handle);
    free(window->surface.pixels);
    free(window);
}

void SDL_Quit(void) {
    __sdl_initted = 0;
    __sdl_host_inited = 0;   /* next SDL_Init re-baselines the tick clock */
    __sdl_quit();
}

void SDL_Delay(Uint32 ms) {
    __sdl_delay((int)ms);
}

Uint64 SDL_GetTicks(void) {
    /* f64 ms since SDL_Init → Uint64. Value is a non-negative integer well below
       2^53, so the double→long long→Uint64 path is exact (no 32-bit wrap). */
    return (Uint64)(long long)__sdl_get_ticks();
}

/* ---- Clipboard (todos/0090) ----
   Thin wrappers over the host's __clip_* primitives (kernel slot under the
   OS, process-local slot standalone — host.js createClipboard; the imports
   are declared with the other __sdl_* imports above). fmt 1 is UTF-8 text;
   the kernel slot carries a format tag so richer formats can ride it
   later. Deliberately independent of SDL_Init. */
#define __CLIP_TEXT 1

bool SDL_SetClipboardText(const char *text) {
    int n = text ? (int)strlen(text) : 0;
    if (__clip_set(n ? __CLIP_TEXT : 0, text, n) != 0)
        return SDL_SetError("SDL_SetClipboardText: host clipboard failed");
    return 1;
}

char *SDL_GetClipboardText(void) {
    /* __clip_get returns the TOTAL length (filling at most cap): size with
       cap 0, then read, retrying if another process grew the slot between
       the two calls. Never returns NULL (SDL3 contract): "" when empty. */
    int total = __clip_get(__CLIP_TEXT, 0, 0);
    if (total < 0) total = 0;
    for (;;) {
        char *buf = (char *)malloc((size_t)total + 1);
        if (!buf) { SDL_SetError("Out of memory"); return (char *)calloc(1, 1); }
        int now = total > 0 ? __clip_get(__CLIP_TEXT, buf, total) : 0;
        if (now < 0) now = 0;
        if (now <= total) {
            buf[now < total ? now : total] = 0;
            return buf;
        }
        free(buf);
        total = now;
    }
}

bool SDL_HasClipboardText(void) {
    return __clip_get(__CLIP_TEXT, 0, 0) > 0;
}

bool SDL_ClearClipboardData(void) {
    return __clip_set(0, 0, 0) == 0;
}

void SDL_free(void *mem) { free(mem); }

bool SDL_SetWindowTitle(SDL_Window *window, const char *title) {
    if (!window) return SDL_InvalidParamError("window");
    __sdl_set_window_title(window->handle, title);
    return 1;
}

/* ---- Relative mouse mode (todos/0018) ----
   The REQUESTED mode is tracked here (SDL3: Get returns what Set asked for);
   the host arms the actual pointer-lock machinery (browser: lock on the next
   click into the window; the user can drop the lock with ESC and re-lock by
   clicking back in — the requested mode is unchanged throughout). While the
   pointer is locked the host pushes motion with true relative deltas
   (__sdl_push_mouse_motion_rel_event) instead of absolute positions. */
bool SDL_SetWindowRelativeMouseMode(SDL_Window *window, bool enabled) {
    if (!window) return SDL_InvalidParamError("window");
    window->relative_mouse = enabled ? 1 : 0;
    __sdl_set_relative_mouse_mode(window->handle, window->relative_mouse);
    return 1;
}

bool SDL_GetWindowRelativeMouseMode(SDL_Window *window) {
    if (!window) return SDL_InvalidParamError("window");
    return window->relative_mouse;
}

/* ---- Cursors (todos/0105) ----
   A cursor object is just its shape id. The active cursor + visibility are
   application-global (SDL semantics); the effective shape pushed to the host
   is the current cursor's shape while visible, -1 (hidden) otherwise. With
   one window per process, the host applies it to that process's surface.
   __sdl_current_window() finds it (newest window; 0 = no window yet). */
struct SDL_Cursor { int shape; };

static SDL_Cursor __sdl_default_cursor = { SDL_SYSTEM_CURSOR_DEFAULT };
static SDL_Cursor *__sdl_active_cursor = &__sdl_default_cursor;
static int __sdl_cursor_shown = 1;

static int __sdl_cursor_win_handle(void) {
    for (int i = __SDL_MAX_WINDOWS - 1; i >= 0; i--)
        if (__sdl_window_registry[i]) return __sdl_window_registry[i]->handle;
    return 0;
}

static void __sdl_cursor_apply(void) {
    int shape = __sdl_cursor_shown && __sdl_active_cursor
        ? __sdl_active_cursor->shape : -1;
    __sdl_set_cursor(__sdl_cursor_win_handle(), shape);
}

SDL_Cursor *SDL_CreateSystemCursor(SDL_SystemCursor id) {
    if (id < 0 || id >= SDL_SYSTEM_CURSOR_COUNT) {
        SDL_SetError("SDL_CreateSystemCursor: bad id");
        return NULL;
    }
    SDL_Cursor *c = (SDL_Cursor *)malloc(sizeof(SDL_Cursor));
    if (!c) return NULL;
    c->shape = (int)id;
    return c;
}

bool SDL_SetCursor(SDL_Cursor *cursor) {
    /* SDL3: NULL just forces a redraw of the current cursor. */
    if (cursor) __sdl_active_cursor = cursor;
    __sdl_cursor_apply();
    return 1;
}

SDL_Cursor *SDL_GetCursor(void) { return __sdl_active_cursor; }
SDL_Cursor *SDL_GetDefaultCursor(void) { return &__sdl_default_cursor; }

void SDL_DestroyCursor(SDL_Cursor *cursor) {
    if (!cursor || cursor == &__sdl_default_cursor) return;
    if (cursor == __sdl_active_cursor) {
        __sdl_active_cursor = &__sdl_default_cursor;
        __sdl_cursor_apply();
    }
    free(cursor);
}

bool SDL_ShowCursor(void) {
    __sdl_cursor_shown = 1;
    __sdl_cursor_apply();
    return 1;
}

bool SDL_HideCursor(void) {
    __sdl_cursor_shown = 0;
    __sdl_cursor_apply();
    return 1;
}

bool SDL_CursorVisible(void) { return __sdl_cursor_shown ? 1 : 0; }

/* ---- SDL_Renderer (2D accelerated) ----
   Opaque to user code; carries the host renderer handle. SDL_Texture is a
   complete type (SDL.h) so programs can read tex->w/h; __handle is the host id.
   Every draw flattens to __sdl_render_quad (4 dst corners + src rect). */
struct SDL_Renderer {
    int handle;
};

SDL_Renderer *SDL_CreateRenderer(SDL_Window *window, const char *name) {
    (void)name;
    int h = __sdl_create_renderer(window ? window->handle : 0);
    if (h <= 0) { SDL_SetError("SDL_CreateRenderer: host failed to create a renderer"); return NULL; }
    SDL_Renderer *r = (SDL_Renderer *)malloc(sizeof(SDL_Renderer));
    if (!r) { SDL_SetError("Out of memory"); return NULL; }
    r->handle = h;
    return r;
}

void SDL_DestroyRenderer(SDL_Renderer *renderer) {
    if (!renderer) return;
    __sdl_destroy_renderer(renderer->handle);
    free(renderer);
}

SDL_Texture *SDL_CreateTexture(SDL_Renderer *renderer, SDL_PixelFormat format, SDL_TextureAccess access, int w, int h) {
    if (!renderer) { SDL_InvalidParamError("renderer"); return NULL; }
    int th = __sdl_create_texture(renderer->handle, (int)access, w, h);
    if (th <= 0) { SDL_SetError("SDL_CreateTexture: host failed to create a texture (%dx%d)", w, h); return NULL; }
    SDL_Texture *t = (SDL_Texture *)malloc(sizeof(SDL_Texture));
    if (!t) { SDL_SetError("Out of memory"); return NULL; }
    t->format = format;
    t->w = w;
    t->h = h;
    t->__handle = th;
    /* SDL3 default blend mode is alpha-aware: an alpha-format texture defaults to
       SDL_BLENDMODE_BLEND, a non-alpha one to SDL_BLENDMODE_NONE
       (src/render/SDL_render.c). */
    SDL_SetTextureBlendMode(t, SDL_ISPIXELFORMAT_ALPHA(format) ? SDL_BLENDMODE_BLEND : SDL_BLENDMODE_NONE);
    return t;
}

SDL_Texture *SDL_CreateTextureFromSurface(SDL_Renderer *renderer, SDL_Surface *surface) {
    if (!renderer) { SDL_InvalidParamError("renderer"); return NULL; }
    if (!surface) { SDL_InvalidParamError("surface"); return NULL; }
    SDL_Texture *t = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                       SDL_TEXTUREACCESS_STATIC, surface->w, surface->h);
    if (!t) return 0;
    __sdl_update_texture(t->__handle, surface->pixels, surface->pitch, 0, 0, surface->w, surface->h);
    /* SDL defaults a surface-derived texture to BLEND when the surface has an
       alpha channel; our surfaces are always RGBA32 (alpha present), so BLEND. */
    SDL_SetTextureBlendMode(t, SDL_BLENDMODE_BLEND);
    return t;
}

void SDL_DestroyTexture(SDL_Texture *texture) {
    if (!texture) return;
    __sdl_destroy_texture(texture->__handle);
    free(texture);
}

bool SDL_UpdateTexture(SDL_Texture *texture, const SDL_Rect *rect, const void *pixels, int pitch) {
    if (!texture) return SDL_InvalidParamError("texture");
    if (!pixels) return SDL_InvalidParamError("pixels");
    /* SDL3: rect==NULL updates the entire texture; otherwise only that sub-region
       (the source buffer is rect->h rows of 'pitch' bytes). Honour the rect so a
       sub-rect update writes the right pixels AND the host reads only the bytes the
       caller actually provided (the old full-size read was wrong + read OOB). */
    int x = 0, y = 0, w = texture->w, h = texture->h;
    if (rect) {
        x = rect->x; y = rect->y; w = rect->w; h = rect->h;
        if (x < 0 || y < 0 || w < 0 || h < 0 || x + w > texture->w || y + h > texture->h)
            return SDL_SetError("SDL_UpdateTexture: rect is outside the texture bounds");
    }
    __sdl_update_texture(texture->__handle, pixels, pitch, x, y, w, h);
    return 1;
}

bool SDL_SetTextureColorMod(SDL_Texture *texture, Uint8 r, Uint8 g, Uint8 b) {
    if (!texture) return SDL_InvalidParamError("texture");
    __sdl_set_texture_color_mod(texture->__handle, r / 255.0, g / 255.0, b / 255.0);
    return 1;
}

bool SDL_SetTextureAlphaMod(SDL_Texture *texture, Uint8 alpha) {
    if (!texture) return SDL_InvalidParamError("texture");
    __sdl_set_texture_alpha_mod(texture->__handle, alpha / 255.0);
    return 1;
}

bool SDL_SetTextureBlendMode(SDL_Texture *texture, SDL_BlendMode blendMode) {
    if (!texture) return SDL_InvalidParamError("texture");
    __sdl_set_texture_blend_mode(texture->__handle, (int)blendMode);
    return 1;
}

bool SDL_GetTextureBlendMode(SDL_Texture *texture, SDL_BlendMode *blendMode) {
    if (!texture) return SDL_InvalidParamError("texture");
    if (blendMode) *blendMode = (SDL_BlendMode)__sdl_get_texture_blend_mode(texture->__handle);
    return 1;
}

bool SDL_SetTextureScaleMode(SDL_Texture *texture, SDL_ScaleMode scaleMode) {
    if (!texture) return SDL_InvalidParamError("texture");
    __sdl_set_texture_scale_mode(texture->__handle, (int)scaleMode);
    return 1;
}

bool SDL_GetTextureScaleMode(SDL_Texture *texture, SDL_ScaleMode *scaleMode) {
    if (!texture) return SDL_InvalidParamError("texture");
    if (scaleMode) *scaleMode = (SDL_ScaleMode)__sdl_get_texture_scale_mode(texture->__handle);
    return 1;
}

bool SDL_SetRenderDrawColor(SDL_Renderer *renderer, Uint8 r, Uint8 g, Uint8 b, Uint8 a) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    __sdl_set_draw_color(renderer->handle, r / 255.0, g / 255.0, b / 255.0, a / 255.0);
    return 1;
}

bool SDL_SetRenderDrawBlendMode(SDL_Renderer *renderer, SDL_BlendMode blendMode) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    __sdl_set_draw_blend_mode(renderer->handle, (int)blendMode);
    return 1;
}

bool SDL_RenderClear(SDL_Renderer *renderer) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    __sdl_render_clear(renderer->handle);
    return 1;
}

/* Axis-aligned quad helper from a dst rect (x,y,w,h) + src rect. */
static void __sdl_quad_rect(int r, int texH, float dx, float dy, float dw, float dh,
                            float sx, float sy, float sw, float sh) {
    __sdl_render_quad(r, texH, dx, dy, dx + dw, dy, dx + dw, dy + dh, dx, dy + dh,
                      sx, sy, sw, sh);
}

bool SDL_RenderTexture(SDL_Renderer *renderer, SDL_Texture *texture,
                       const SDL_FRect *srcrect, const SDL_FRect *dstrect) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    if (!texture) return SDL_InvalidParamError("texture");
    float sx = 0, sy = 0, sw = (float)texture->w, sh = (float)texture->h;
    if (srcrect) { sx = srcrect->x; sy = srcrect->y; sw = srcrect->w; sh = srcrect->h; }
    float dx = 0, dy = 0, dw = (float)texture->w, dh = (float)texture->h;
    if (dstrect) { dx = dstrect->x; dy = dstrect->y; dw = dstrect->w; dh = dstrect->h; }
    __sdl_quad_rect(renderer->handle, texture->__handle, dx, dy, dw, dh, sx, sy, sw, sh);
    return 1;
}

bool SDL_RenderFillRect(SDL_Renderer *renderer, const SDL_FRect *rect) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    float dx = 0, dy = 0, dw = 0, dh = 0;
    if (rect) { dx = rect->x; dy = rect->y; dw = rect->w; dh = rect->h; }
    __sdl_quad_rect(renderer->handle, 0, dx, dy, dw, dh, 0, 0, 1, 1);
    return 1;
}

bool SDL_RenderRect(SDL_Renderer *renderer, const SDL_FRect *rect) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    if (!rect) return 1;
    float x = rect->x, y = rect->y, w = rect->w, h = rect->h;
    __sdl_quad_rect(renderer->handle, 0, x, y, w, 1, 0, 0, 1, 1);          /* top */
    __sdl_quad_rect(renderer->handle, 0, x, y + h - 1, w, 1, 0, 0, 1, 1);  /* bottom */
    __sdl_quad_rect(renderer->handle, 0, x, y, 1, h, 0, 0, 1, 1);          /* left */
    __sdl_quad_rect(renderer->handle, 0, x + w - 1, y, 1, h, 0, 0, 1, 1);  /* right */
    return 1;
}

bool SDL_RenderLine(SDL_Renderer *renderer, float x1, float y1, float x2, float y2) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    float ddx = x2 - x1, ddy = y2 - y1;
    float len = (float)sqrt(ddx * ddx + ddy * ddy);
    if (len < 0.0001f) {
        __sdl_quad_rect(renderer->handle, 0, x1, y1, 1, 1, 0, 0, 1, 1);
        return 1;
    }
    /* a 1px-thick quad along the line (perpendicular half-width 0.5) */
    float nx = -ddy / len * 0.5f, ny = ddx / len * 0.5f;
    __sdl_render_quad(renderer->handle, 0,
                      x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny,
                      0, 0, 1, 1);
    return 1;
}

bool SDL_RenderPoint(SDL_Renderer *renderer, float x, float y) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    __sdl_quad_rect(renderer->handle, 0, x, y, 1, 1, 0, 0, 1, 1);
    return 1;
}

bool SDL_RenderGeometry(SDL_Renderer *renderer, SDL_Texture *texture,
                        const SDL_Vertex *vertices, int num_vertices,
                        const int *indices, int num_indices) {
    if (!renderer) return SDL_InvalidParamError("renderer");
    if (!vertices) return SDL_InvalidParamError("vertices");
    if (num_vertices < 3) return SDL_SetError("SDL_RenderGeometry: num_vertices must be >= 3");
    if (indices && num_indices % 3 != 0) return SDL_SetError("SDL_RenderGeometry: num_indices must be a multiple of 3");
    int n = indices ? num_indices : num_vertices;
    if (n <= 0) return 1;
    /* Resolve indices into a flat triangle soup of [x,y,u,v,r,g,b,a] per vertex
       (host stays struct-ignorant — it just reads floats). */
    float *buf = (float *)malloc((size_t)n * 8 * sizeof(float));
    if (!buf) return SDL_SetError("Out of memory");
    for (int i = 0; i < n; i++) {
        const SDL_Vertex *v = &vertices[indices ? indices[i] : i];
        float *o = buf + (size_t)i * 8;
        o[0] = v->position.x;  o[1] = v->position.y;
        o[2] = v->tex_coord.x; o[3] = v->tex_coord.y;
        o[4] = v->color.r;     o[5] = v->color.g;
        o[6] = v->color.b;     o[7] = v->color.a;
    }
    __sdl_render_geometry(renderer->handle, texture ? texture->__handle : 0, buf, n);
    free(buf);
    return 1;
}

void SDL_RenderPresent(SDL_Renderer *renderer) {
    if (!renderer) { SDL_InvalidParamError("renderer"); return; }
    __sdl_render_present(renderer->handle);
}

void __setAnimationFrameFunc(void (*callback)(void)) {
    __sdl_set_animation_frame_func(callback);
}
  `,
  "__webgpu.c": `
#include <webgpu.h>
#include <stdio.h>
#include <stdlib.h>

/* Low-level host imports — primitives only (handles are i32 indices into the
   host handle table; pointers are i32; clear color is f64). host.js never reads
   C struct layouts: __webgpu.c flattens descriptors here. See todos/WEBGPU.md. */
__import int  __wgpu_create_instance(void);
__import int  __wgpu_instance_create_surface(int instance);
__import void __wgpu_instance_request_adapter(int instance, WGPURequestAdapterCallback cb, void *ud1, void *ud2);
__import void __wgpu_adapter_request_device(int adapter, WGPURequestDeviceCallback cb, void *ud1, void *ud2);
__import int  __wgpu_device_get_queue(int device);
__import int  __wgpu_surface_get_preferred_format(int surface);
__import void __wgpu_surface_configure(int surface, int device, int format, int usage, int width, int height, int alphaMode, int presentMode, const int *viewFormatsPacked, int viewFormatsLen);
__import int  __wgpu_surface_get_current_texture(int surface);
__import void __wgpu_surface_present(int surface);
__import int  __wgpu_texture_create_view(int texture, int format, int dimension, int baseMip, int mipCount, int baseLayer, int layerCount, int aspect);
__import int  __wgpu_device_create_shader_module_wgsl(int device, const char *code, int codeLen);
__import int  __wgpu_device_create_render_pipeline(int device, int vsModule, const char *vsEntry, int vsEntryLen, int fsModule, const char *fsEntry, int fsEntryLen, const int *targetsPacked, int targetsLen, int topology, int stripIndexFormat, int cullMode, int frontFace, const int *vbLayout, int vbLayoutLen, int layout, int depthEnabled, int depthFormat, int depthWriteEnabled, int depthCompare, int depthBias, double depthBiasSlopeScale, double depthBiasClamp, const int *stencilPacked, int sampleCount, int sampleMask, int alphaToCoverage, const int *vsConstInts, int vsConstIntsLen, const double *vsConstVals, const int *fsConstInts, int fsConstIntsLen, const double *fsConstVals);
__import int  __wgpu_device_create_buffer(int device, int size, int usage, int mappedAtCreation);
__import void __wgpu_queue_write_buffer(int queue, int buffer, int bufferOffset, const void *data, int size);
__import void __wgpu_render_pass_set_vertex_buffer(int pass, int slot, int buffer, int offset, int size);
__import void __wgpu_render_pass_set_index_buffer(int pass, int buffer, int format, int offset, int size);
__import void __wgpu_render_pass_draw_indexed(int pass, int indexCount, int instanceCount, int firstIndex, int baseVertex, int firstInstance);
__import int  __wgpu_device_create_bind_group_layout(int device, const int *packed, int packedLen);
__import int  __wgpu_device_create_pipeline_layout(int device, const int *bgls, int count);
__import int  __wgpu_device_create_bind_group(int device, int layout, const int *packed, int packedLen);
__import void __wgpu_render_pass_set_bind_group(int pass, int index, int group, const int *offsets, int offsetCount);
__import int  __wgpu_device_create_texture(int device, int width, int height, int depthOrArrayLayers, int format, int usage, int dimension, int mipLevelCount, int sampleCount);
__import int  __wgpu_device_create_sampler(int device, int addrU, int addrV, int addrW, int magFilter, int minFilter, int mipmapFilter, double lodMinClamp, double lodMaxClamp, int maxAnisotropy, int compare);
__import void __wgpu_queue_write_texture(int queue, int texture, int mipLevel, int originX, int originY, int originZ, int aspect, const void *data, int dataSize, int offset, int bytesPerRow, int rowsPerImage, int width, int height, int depthOrArrayLayers);
__import void __wgpu_cmd_copy_texture_to_buffer(int encoder, int srcTexture, int mipLevel, int ox, int oy, int oz, int dstBuffer, int offset, int bytesPerRow, int rowsPerImage, int width, int height, int depth);
__import void __wgpu_buffer_map_async(int buffer, int mode, int offset, int size, WGPUBufferMapCallback cb, void *ud1, void *ud2);
__import int  __wgpu_buffer_get_size(int buffer);
__import void __wgpu_buffer_get_mapped_range(int buffer, int offset, int size, void *dst);
__import void __wgpu_buffer_unmap(int buffer);
__import void __wgpu_cmd_copy_buffer_to_buffer(int encoder, int src, int srcOffset, int dst, int dstOffset, int size);
__import int  __wgpu_device_create_compute_pipeline(int device, int module, const char *entry, int entryLen, int layout, const int *constInts, int constIntsLen, const double *constVals);
__import int  __wgpu_command_encoder_begin_compute_pass(int encoder);
__import void __wgpu_compute_pass_set_pipeline(int pass, int pipeline);
__import void __wgpu_compute_pass_set_bind_group(int pass, int index, int group, const int *offsets, int offsetCount);
__import void __wgpu_compute_pass_dispatch(int pass, int x, int y, int z);
__import void __wgpu_compute_pass_end(int pass);
__import void __wgpu_device_push_error_scope(int device, int filter);
__import void __wgpu_device_pop_error_scope(int device, WGPUPopErrorScopeCallback cb, void *ud1, void *ud2);
__import int  __wgpu_device_create_command_encoder(int device);
__import int  __wgpu_command_encoder_begin_render_pass(int encoder, const int *colorPacked, int colorLen, const double *clearPacked, int depthView, int depthLoadOp, int depthStoreOp, double depthClearValue, int depthReadOnly, int stencilLoadOp, int stencilStoreOp, int stencilClearValue, int stencilReadOnly);
__import void __wgpu_render_pass_set_stencil_reference(int pass, int reference);
__import void __wgpu_render_pass_set_pipeline(int pass, int pipeline);
__import void __wgpu_render_pass_draw(int pass, int vc, int ic, int fv, int fi);
__import void __wgpu_render_pass_end(int pass);
__import int  __wgpu_command_encoder_finish(int encoder);
__import void __wgpu_queue_submit_one(int queue, int commandBuffer);
__import void __wgpu_release(int handle);
__import void __sdl_set_animation_frame_func(void (*callback)(void));

WGPUInstance wgpuCreateInstance(const WGPUInstanceDescriptor *descriptor) {
    (void)descriptor;
    return (WGPUInstance)__wgpu_create_instance();
}

WGPUSurface wgpuInstanceCreateSurface(WGPUInstance instance, const WGPUSurfaceDescriptor *descriptor) {
    (void)descriptor;
    return (WGPUSurface)__wgpu_instance_create_surface((int)instance);
}

static unsigned long long __wgpu_future_seq = 0;

WGPUFuture wgpuInstanceRequestAdapter(WGPUInstance instance,
        const WGPURequestAdapterOptions *options, WGPURequestAdapterCallbackInfo callbackInfo) {
    (void)options;
    __wgpu_instance_request_adapter((int)instance, callbackInfo.callback,
                                    callbackInfo.userdata1, callbackInfo.userdata2);
    WGPUFuture f; f.id = ++__wgpu_future_seq; return f;
}

WGPUFuture wgpuAdapterRequestDevice(WGPUAdapter adapter,
        const WGPUDeviceDescriptor *descriptor, WGPURequestDeviceCallbackInfo callbackInfo) {
    (void)descriptor;
    __wgpu_adapter_request_device((int)adapter, callbackInfo.callback,
                                  callbackInfo.userdata1, callbackInfo.userdata2);
    WGPUFuture f; f.id = ++__wgpu_future_seq; return f;
}

/* Trampolines invoked by host.js when the requestAdapter/requestDevice promise
   settles. They rebuild the by-value WGPUStringView in C (the host only passes
   primitives) and call the user's callback through its table index. */
void __wgpu_call_adapter_cb(WGPURequestAdapterCallback cb, int status,
        WGPUAdapter adapter, const char *msg, int msgLen, void *ud1, void *ud2) {
    WGPUStringView sv; sv.data = msg; sv.length = (size_t)(msgLen < 0 ? 0 : msgLen);
    if (cb) cb((WGPURequestAdapterStatus)status, adapter, sv, ud1, ud2);
}
__export __wgpu_call_adapter_cb = __wgpu_call_adapter_cb;

void __wgpu_call_device_cb(WGPURequestDeviceCallback cb, int status,
        WGPUDevice device, const char *msg, int msgLen, void *ud1, void *ud2) {
    WGPUStringView sv; sv.data = msg; sv.length = (size_t)(msgLen < 0 ? 0 : msgLen);
    if (cb) cb((WGPURequestDeviceStatus)status, device, sv, ud1, ud2);
}
__export __wgpu_call_device_cb = __wgpu_call_device_cb;

void __wgpu_call_buffer_map_cb(WGPUBufferMapCallback cb, int status, void *ud1, void *ud2) {
    WGPUStringView sv; sv.data = 0; sv.length = 0;
    if (cb) cb((WGPUMapAsyncStatus)status, sv, ud1, ud2);
}
__export __wgpu_call_buffer_map_cb = __wgpu_call_buffer_map_cb;

void __wgpu_call_pop_error_cb(WGPUPopErrorScopeCallback cb, int status, int type, void *ud1, void *ud2) {
    WGPUStringView sv; sv.data = 0; sv.length = 0;   /* message is logged host-side */
    if (cb) cb((WGPUPopErrorScopeStatus)status, (WGPUErrorType)type, sv, ud1, ud2);
}
__export __wgpu_call_pop_error_cb = __wgpu_call_pop_error_cb;

WGPUQueue wgpuDeviceGetQueue(WGPUDevice device) {
    return (WGPUQueue)__wgpu_device_get_queue((int)device);
}

WGPUTextureFormat wgpuSurfaceGetPreferredFormat(WGPUSurface surface, WGPUAdapter adapter) {
    (void)adapter;
    return (WGPUTextureFormat)__wgpu_surface_get_preferred_format((int)surface);
}

void wgpuSurfaceConfigure(WGPUSurface surface, const WGPUSurfaceConfiguration *config) {
    /* viewFormats packed: [ count, fmt0, fmt1, ... ]. */
    static int vf[1 + 16];
    int vc = (int)config->viewFormatCount;
    if (vc > 16) {
        fprintf(stderr, "wgpuSurfaceConfigure: too many viewFormats (%d > 16); raise vf[]\\n", vc);
        abort();
    }
    int vfn = 0;
    vf[vfn++] = vc;
    for (int i = 0; i < vc; i++) vf[vfn++] = (int)config->viewFormats[i];
    __wgpu_surface_configure((int)surface, (int)config->device, (int)config->format,
        (int)config->usage, (int)config->width, (int)config->height, (int)config->alphaMode,
        (int)config->presentMode, vf, vfn);
}

void wgpuSurfaceGetCurrentTexture(WGPUSurface surface, WGPUSurfaceTexture *surfaceTexture) {
    int t = __wgpu_surface_get_current_texture((int)surface);
    surfaceTexture->nextInChain = 0;
    surfaceTexture->texture = (WGPUTexture)t;
    surfaceTexture->status = t ? WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal
                               : WGPUSurfaceGetCurrentTextureStatus_Error;
}

void wgpuSurfacePresent(WGPUSurface surface) {
    /* Web canvas: presentation is implicit (the browser presents the configured
       context after the frame) — the host import is a no-op there. Under the OS
       it is the real present: gpu transport hands the frame to the kernel as an
       ImageBitmap; the Dawn (headless) tier does the readback -> shm flip. */
    __wgpu_surface_present((int)surface);
}

WGPUTextureView wgpuTextureCreateView(WGPUTexture texture, const WGPUTextureViewDescriptor *d) {
    /* NULL descriptor (or all-zero fields) => host applies WebGPU defaults. */
    if (!d)
        return (WGPUTextureView)__wgpu_texture_create_view((int)texture, 0, 0, 0, 0, 0, 0, 0);
    return (WGPUTextureView)__wgpu_texture_create_view((int)texture,
        (int)d->format, (int)d->dimension, (int)d->baseMipLevel, (int)d->mipLevelCount,
        (int)d->baseArrayLayer, (int)d->arrayLayerCount, (int)d->aspect);
}

WGPUShaderModule wgpuDeviceCreateShaderModule(WGPUDevice device, const WGPUShaderModuleDescriptor *descriptor) {
    const WGPUChainedStruct *c = descriptor->nextInChain;
    while (c) {
        if (c->sType == WGPUSType_ShaderSourceWGSL) {
            const WGPUShaderSourceWGSL *w = (const WGPUShaderSourceWGSL *)c;
            return (WGPUShaderModule)__wgpu_device_create_shader_module_wgsl(
                (int)device, w->code.data, (int)w->code.length);
        }
        c = c->next;
    }
    return (WGPUShaderModule)0;
}

/* Pack WGPUConstantEntry[] (pipeline-overridable constants) into a parallel int
   array (keys) + double array (values), the host staying struct-ignorant. Int
   layout: [ count, per entry: keyPtr, keyLen ]; dp[i] = value. Returns the int
   array length. Each stage gets its own static buffers (a render pipeline may
   set both vertex and fragment constants). */
static int __wgpu_pack_constants(const WGPUConstantEntry *cs, int count, int *ip, double *dp, int cap) {
    if (1 + count * 2 > cap) {
        fprintf(stderr, "wgpu: pipeline constants exceed packed cap (%d entries max); raise the buffer\\n", (cap - 1) / 2);
        abort();
    }
    int n = 0;
    ip[n++] = count;
    for (int i = 0; i < count; i++) {
        ip[n++] = (int)cs[i].key.data;
        ip[n++] = (int)cs[i].key.length;
        dp[i] = cs[i].value;
    }
    return n;
}

WGPURenderPipeline wgpuDeviceCreateRenderPipeline(WGPUDevice device, const WGPURenderPipelineDescriptor *desc) {
    int fsModule = 0, fsEntryLen = 0;
    const char *fsEntry = 0;
    if (desc->fragment) {
        fsModule = (int)desc->fragment->module;
        fsEntry = desc->fragment->entryPoint.data;
        fsEntryLen = (int)desc->fragment->entryPoint.length;
    }

    /* Flatten the variable-length vertex.buffers[] (buffers -> attributes) into
       ONE packed int array; the host stays struct-ignorant and reads only ints.
       Layout: [ bufferCount,
                 per buffer: arrayStride, stepMode, attrCount,
                   per attr: format, byteOffset, shaderLocation ].
       This is the packed-array convention all array-bearing WebGPU descriptors
       use here. */
    static int vb[256];
    int n = 0, cap = (int)(sizeof(vb) / sizeof(vb[0]));
    int bc = (int)desc->vertex.bufferCount;
    vb[n++] = bc;
    for (int i = 0; i < bc; i++) {
        const WGPUVertexBufferLayout *L = &desc->vertex.buffers[i];
        int ac = (int)L->attributeCount;
        if (n + 3 + ac * 3 > cap) {
            fprintf(stderr, "wgpuDeviceCreateRenderPipeline: vertex layout exceeds packed cap (%d ints); raise vb[]\\n", cap);
            abort();
        }
        vb[n++] = (int)L->arrayStride;
        vb[n++] = (int)L->stepMode;
        vb[n++] = ac;
        for (int j = 0; j < ac; j++) {
            vb[n++] = (int)L->attributes[j].format;
            vb[n++] = (int)L->attributes[j].offset;
            vb[n++] = (int)L->attributes[j].shaderLocation;
        }
    }

    /* Color targets (MRT) + per-target write masks + blend, packed into ONE int
       array (the host stays struct-ignorant; same packed-array convention as the
       vertex layout above). Layout: [ targetCount,
         per target: format, writeMask, blendEnabled,
           colorOp, colorSrc, colorDst, alphaOp, alphaSrc, alphaDst ].
       NULL blend => blendEnabled 0 (host leaves the target unblended/opaque). */
    static int ct[1 + 8 * 9];
    int ctn = 0, ctcap = (int)(sizeof(ct) / sizeof(ct[0]));
    int targetCount = (desc->fragment && desc->fragment->targets) ? (int)desc->fragment->targetCount : 0;
    ct[ctn++] = targetCount;
    for (int t = 0; t < targetCount; t++) {
        const WGPUColorTargetState *T = &desc->fragment->targets[t];
        if (ctn + 9 > ctcap) {
            fprintf(stderr, "wgpuDeviceCreateRenderPipeline: color targets exceed packed cap (%d); raise ct[]\\n", ctcap);
            abort();
        }
        ct[ctn++] = (int)T->format;
        ct[ctn++] = (int)T->writeMask;
        const WGPUBlendState *bl = T->blend;
        if (bl) {
            ct[ctn++] = 1;
            ct[ctn++] = (int)bl->color.operation; ct[ctn++] = (int)bl->color.srcFactor; ct[ctn++] = (int)bl->color.dstFactor;
            ct[ctn++] = (int)bl->alpha.operation; ct[ctn++] = (int)bl->alpha.srcFactor; ct[ctn++] = (int)bl->alpha.dstFactor;
        } else {
            ct[ctn++] = 0; ct[ctn++] = 0; ct[ctn++] = 0; ct[ctn++] = 0; ct[ctn++] = 0; ct[ctn++] = 0; ct[ctn++] = 0;
        }
    }

    /* Depth/stencil state. NULL => no depth testing (host skips). */
    int depthEnabled = 0, depthFormat = 0, depthWriteEnabled = 0, depthCompare = 0, depthBias = 0;
    double depthBiasSlopeScale = 0, depthBiasClamp = 0;
    if (desc->depthStencil) {
        depthEnabled = 1;
        depthFormat = (int)desc->depthStencil->format;
        depthWriteEnabled = (int)desc->depthStencil->depthWriteEnabled;
        depthCompare = (int)desc->depthStencil->depthCompare;
        depthBias = (int)desc->depthStencil->depthBias;
        depthBiasSlopeScale = (double)desc->depthStencil->depthBiasSlopeScale;
        depthBiasClamp = (double)desc->depthStencil->depthBiasClamp;
    }

    /* Stencil face states, packed (NULL => no stencil): [ frontCompare, frontFail,
       frontDepthFail, frontPass, backCompare, backFail, backDepthFail, backPass,
       readMask, writeMask ]. Configured when either face has a compare set. */
    static int stencil[10];
    const int *stencilPtr = 0;
    if (desc->depthStencil &&
        (desc->depthStencil->stencilFront.compare != WGPUCompareFunction_Undefined ||
         desc->depthStencil->stencilBack.compare != WGPUCompareFunction_Undefined)) {
        const WGPUStencilFaceState *f = &desc->depthStencil->stencilFront;
        const WGPUStencilFaceState *b = &desc->depthStencil->stencilBack;
        stencil[0] = (int)f->compare; stencil[1] = (int)f->failOp; stencil[2] = (int)f->depthFailOp; stencil[3] = (int)f->passOp;
        stencil[4] = (int)b->compare; stencil[5] = (int)b->failOp; stencil[6] = (int)b->depthFailOp; stencil[7] = (int)b->passOp;
        stencil[8] = (int)desc->depthStencil->stencilReadMask;
        stencil[9] = (int)desc->depthStencil->stencilWriteMask;
        stencilPtr = stencil;
    }

    /* Multisample state. count defaults to 1; mask defaults to all-ones. */
    int sampleCount = (int)(desc->multisample.count ? desc->multisample.count : 1);
    int sampleMask = (int)desc->multisample.mask;
    int alphaToCoverage = (int)desc->multisample.alphaToCoverageEnabled;

    /* Pipeline-overridable constants for the vertex + fragment stages. */
    static int vsc[1 + 64 * 2]; static double vscv[64];
    static int fsc[1 + 64 * 2]; static double fscv[64];
    int vscn = __wgpu_pack_constants(desc->vertex.constants, (int)desc->vertex.constantCount, vsc, vscv, (int)(sizeof(vsc) / sizeof(vsc[0])));
    int fscn = 1; fsc[0] = 0;
    if (desc->fragment)
        fscn = __wgpu_pack_constants(desc->fragment->constants, (int)desc->fragment->constantCount, fsc, fscv, (int)(sizeof(fsc) / sizeof(fsc[0])));

    return (WGPURenderPipeline)__wgpu_device_create_render_pipeline(
        (int)device,
        (int)desc->vertex.module, desc->vertex.entryPoint.data, (int)desc->vertex.entryPoint.length,
        fsModule, fsEntry, fsEntryLen,
        ct, ctn, (int)desc->primitive.topology, (int)desc->primitive.stripIndexFormat,
        (int)desc->primitive.cullMode, (int)desc->primitive.frontFace,
        vb, n, (int)desc->layout,
        depthEnabled, depthFormat, depthWriteEnabled, depthCompare, depthBias, depthBiasSlopeScale, depthBiasClamp, stencilPtr,
        sampleCount, sampleMask, alphaToCoverage,
        vsc, vscn, vscv, fsc, fscn, fscv);
}

WGPUCommandEncoder wgpuDeviceCreateCommandEncoder(WGPUDevice device, const WGPUCommandEncoderDescriptor *descriptor) {
    (void)descriptor;
    return (WGPUCommandEncoder)__wgpu_device_create_command_encoder((int)device);
}

WGPURenderPassEncoder wgpuCommandEncoderBeginRenderPass(WGPUCommandEncoder commandEncoder, const WGPURenderPassDescriptor *desc) {
    /* Color attachments, packed (host stays struct-ignorant). Ints:
       [ count, per attachment: view, resolveTarget, loadOp, storeOp, depthSlice ].
       clearValue (4 doubles/attachment) rides a parallel double array, in order. */
    static int ca[1 + 8 * 5];
    static double cc[8 * 4];
    int can = 0, cacap = (int)(sizeof(ca) / sizeof(ca[0])), ccn = 0;
    int colorCount = (desc->colorAttachments) ? (int)desc->colorAttachmentCount : 0;
    ca[can++] = colorCount;
    for (int i = 0; i < colorCount; i++) {
        const WGPURenderPassColorAttachment *att = &desc->colorAttachments[i];
        if (can + 5 > cacap) {
            fprintf(stderr, "wgpuCommandEncoderBeginRenderPass: color attachments exceed packed cap (%d); raise ca[]\\n", cacap);
            abort();
        }
        ca[can++] = (int)att->view;
        ca[can++] = (int)att->resolveTarget;
        ca[can++] = (int)att->loadOp;
        ca[can++] = (int)att->storeOp;
        ca[can++] = (int)att->depthSlice;
        cc[ccn++] = att->clearValue.r; cc[ccn++] = att->clearValue.g;
        cc[ccn++] = att->clearValue.b; cc[ccn++] = att->clearValue.a;
    }
    int depthView = 0, depthLoadOp = 0, depthStoreOp = 0, depthReadOnly = 0;
    double depthClearValue = 1.0;
    int stencilLoadOp = 0, stencilStoreOp = 0, stencilClearValue = 0, stencilReadOnly = 0;
    if (desc->depthStencilAttachment) {
        const WGPURenderPassDepthStencilAttachment *d = desc->depthStencilAttachment;
        depthView = (int)d->view;
        depthLoadOp = (int)d->depthLoadOp;
        depthStoreOp = (int)d->depthStoreOp;
        depthClearValue = d->depthClearValue;
        depthReadOnly = (int)d->depthReadOnly;
        stencilLoadOp = (int)d->stencilLoadOp;
        stencilStoreOp = (int)d->stencilStoreOp;
        stencilClearValue = (int)d->stencilClearValue;
        stencilReadOnly = (int)d->stencilReadOnly;
    }
    return (WGPURenderPassEncoder)__wgpu_command_encoder_begin_render_pass(
        (int)commandEncoder, ca, can, cc,
        depthView, depthLoadOp, depthStoreOp, depthClearValue, depthReadOnly,
        stencilLoadOp, stencilStoreOp, stencilClearValue, stencilReadOnly);
}

void wgpuRenderPassEncoderSetStencilReference(WGPURenderPassEncoder renderPassEncoder, uint32_t reference) {
    __wgpu_render_pass_set_stencil_reference((int)renderPassEncoder, (int)reference);
}

void wgpuRenderPassEncoderSetPipeline(WGPURenderPassEncoder renderPassEncoder, WGPURenderPipeline pipeline) {
    __wgpu_render_pass_set_pipeline((int)renderPassEncoder, (int)pipeline);
}

void wgpuRenderPassEncoderDraw(WGPURenderPassEncoder renderPassEncoder, uint32_t vertexCount, uint32_t instanceCount, uint32_t firstVertex, uint32_t firstInstance) {
    __wgpu_render_pass_draw((int)renderPassEncoder, (int)vertexCount, (int)instanceCount, (int)firstVertex, (int)firstInstance);
}

void wgpuRenderPassEncoderEnd(WGPURenderPassEncoder renderPassEncoder) {
    __wgpu_render_pass_end((int)renderPassEncoder);
}

WGPUCommandBuffer wgpuCommandEncoderFinish(WGPUCommandEncoder commandEncoder, const WGPUCommandBufferDescriptor *descriptor) {
    (void)descriptor;
    return (WGPUCommandBuffer)__wgpu_command_encoder_finish((int)commandEncoder);
}

void wgpuQueueSubmit(WGPUQueue queue, size_t commandCount, const WGPUCommandBuffer *commands) {
    for (size_t i = 0; i < commandCount; i++)
        __wgpu_queue_submit_one((int)queue, (int)commands[i]);
}

WGPUBuffer wgpuDeviceCreateBuffer(WGPUDevice device, const WGPUBufferDescriptor *descriptor) {
    return (WGPUBuffer)__wgpu_device_create_buffer(
        (int)device, (int)descriptor->size, (int)descriptor->usage,
        (int)descriptor->mappedAtCreation);
}

void wgpuQueueWriteBuffer(WGPUQueue queue, WGPUBuffer buffer, uint64_t bufferOffset,
        const void *data, size_t size) {
    __wgpu_queue_write_buffer((int)queue, (int)buffer, (int)bufferOffset, data, (int)size);
}

void wgpuRenderPassEncoderSetVertexBuffer(WGPURenderPassEncoder renderPassEncoder,
        uint32_t slot, WGPUBuffer buffer, uint64_t offset, uint64_t size) {
    __wgpu_render_pass_set_vertex_buffer((int)renderPassEncoder, (int)slot, (int)buffer, (int)offset, (int)size);
}

void wgpuRenderPassEncoderSetIndexBuffer(WGPURenderPassEncoder renderPassEncoder,
        WGPUBuffer buffer, WGPUIndexFormat format, uint64_t offset, uint64_t size) {
    __wgpu_render_pass_set_index_buffer((int)renderPassEncoder, (int)buffer, (int)format, (int)offset, (int)size);
}

void wgpuRenderPassEncoderDrawIndexed(WGPURenderPassEncoder renderPassEncoder,
        uint32_t indexCount, uint32_t instanceCount, uint32_t firstIndex, int32_t baseVertex, uint32_t firstInstance) {
    __wgpu_render_pass_draw_indexed((int)renderPassEncoder, (int)indexCount, (int)instanceCount, (int)firstIndex, (int)baseVertex, (int)firstInstance);
}

WGPUBindGroupLayout wgpuDeviceCreateBindGroupLayout(WGPUDevice device, const WGPUBindGroupLayoutDescriptor *desc) {
    /* Packed: [ entryCount, per entry: binding, visibility, kind, detail, e0, e1, e2 ].
       kind 0=buffer (detail=WGPUBufferBindingType, e0=hasDynamicOffset),
       1=sampler (detail=WGPUSamplerBindingType),
       2=texture (detail=WGPUTextureSampleType, e0=viewDimension, e1=multisampled),
       3=storageTexture (detail=WGPUStorageTextureAccess, e0=format, e1=viewDimension).
       The set sub-struct selects kind. */
    static int p[256];
    int n = 0, cap = (int)(sizeof(p) / sizeof(p[0]));
    int ec = (int)desc->entryCount;
    p[n++] = ec;
    for (int i = 0; i < ec; i++) {
        const WGPUBindGroupLayoutEntry *e = &desc->entries[i];
        int kind, detail, e0 = 0, e1 = 0, e2 = 0;
        if (e->buffer.type != WGPUBufferBindingType_Undefined) {
            kind = 0; detail = (int)e->buffer.type; e0 = (int)e->buffer.hasDynamicOffset;
        } else if (e->sampler.type != WGPUSamplerBindingType_Undefined) {
            kind = 1; detail = (int)e->sampler.type;
        } else if (e->texture.sampleType != WGPUTextureSampleType_Undefined) {
            kind = 2; detail = (int)e->texture.sampleType;
            e0 = (int)e->texture.viewDimension; e1 = (int)e->texture.multisampled;
        } else if (e->storageTexture.format != WGPUTextureFormat_Undefined) {
            kind = 3; detail = (int)e->storageTexture.access;
            e0 = (int)e->storageTexture.format; e1 = (int)e->storageTexture.viewDimension;
        } else {
            kind = 0; detail = (int)WGPUBufferBindingType_Uniform;
        }
        if (n + 7 > cap) { fprintf(stderr, "wgpuDeviceCreateBindGroupLayout: entry cap exceeded\\n"); abort(); }
        p[n++] = (int)e->binding;
        p[n++] = (int)e->visibility;
        p[n++] = kind;
        p[n++] = detail;
        p[n++] = e0;
        p[n++] = e1;
        p[n++] = e2;
    }
    return (WGPUBindGroupLayout)__wgpu_device_create_bind_group_layout((int)device, p, n);
}

WGPUPipelineLayout wgpuDeviceCreatePipelineLayout(WGPUDevice device, const WGPUPipelineLayoutDescriptor *desc) {
    static int bgls[64];
    int c = (int)desc->bindGroupLayoutCount;
    if (c > (int)(sizeof(bgls) / sizeof(bgls[0]))) { fprintf(stderr, "wgpuDeviceCreatePipelineLayout: too many bind group layouts\\n"); abort(); }
    for (int i = 0; i < c; i++) bgls[i] = (int)desc->bindGroupLayouts[i];
    return (WGPUPipelineLayout)__wgpu_device_create_pipeline_layout((int)device, bgls, c);
}

WGPUBindGroup wgpuDeviceCreateBindGroup(WGPUDevice device, const WGPUBindGroupDescriptor *desc) {
    /* Packed: [ entryCount, per entry: binding, kind, handle, offset, size ].
       kind 0=buffer (handle=buffer, offset, size), 1=sampler (handle=sampler),
       2=textureView (handle=textureView). */
    static int p[256];
    int n = 0, cap = (int)(sizeof(p) / sizeof(p[0]));
    int ec = (int)desc->entryCount;
    p[n++] = ec;
    for (int i = 0; i < ec; i++) {
        const WGPUBindGroupEntry *e = &desc->entries[i];
        int kind, handle, offset = 0, size = 0;
        if (e->buffer) { kind = 0; handle = (int)e->buffer; offset = (int)e->offset; size = (int)e->size; }
        else if (e->sampler) { kind = 1; handle = (int)e->sampler; }
        else if (e->textureView) { kind = 2; handle = (int)e->textureView; }
        else { fprintf(stderr, "wgpuDeviceCreateBindGroup: entry %d has no resource\\n", i); abort(); }
        if (n + 5 > cap) { fprintf(stderr, "wgpuDeviceCreateBindGroup: entry cap exceeded\\n"); abort(); }
        p[n++] = (int)e->binding;
        p[n++] = kind;
        p[n++] = handle;
        p[n++] = offset;
        p[n++] = size;
    }
    return (WGPUBindGroup)__wgpu_device_create_bind_group((int)device, (int)desc->layout, p, n);
}

void wgpuRenderPassEncoderSetBindGroup(WGPURenderPassEncoder renderPassEncoder,
        uint32_t groupIndex, WGPUBindGroup group, size_t dynamicOffsetCount, const uint32_t *dynamicOffsets) {
    __wgpu_render_pass_set_bind_group((int)renderPassEncoder, (int)groupIndex, (int)group,
        (const int *)dynamicOffsets, (int)dynamicOffsetCount);
}

WGPUTexture wgpuDeviceCreateTexture(WGPUDevice device, const WGPUTextureDescriptor *d) {
    return (WGPUTexture)__wgpu_device_create_texture((int)device,
        (int)d->size.width, (int)d->size.height, (int)d->size.depthOrArrayLayers,
        (int)d->format, (int)d->usage, (int)d->dimension,
        (int)(d->mipLevelCount ? d->mipLevelCount : 1),
        (int)(d->sampleCount ? d->sampleCount : 1));
}

WGPUSampler wgpuDeviceCreateSampler(WGPUDevice device, const WGPUSamplerDescriptor *d) {
    return (WGPUSampler)__wgpu_device_create_sampler((int)device,
        (int)d->addressModeU, (int)d->addressModeV, (int)d->addressModeW,
        (int)d->magFilter, (int)d->minFilter, (int)d->mipmapFilter,
        (double)d->lodMinClamp, (double)d->lodMaxClamp, (int)d->maxAnisotropy, (int)d->compare);
}

void wgpuQueueWriteTexture(WGPUQueue queue, const WGPUTexelCopyTextureInfo *dst,
        const void *data, size_t dataSize, const WGPUTexelCopyBufferLayout *layout,
        const WGPUExtent3D *size) {
    __wgpu_queue_write_texture((int)queue, (int)dst->texture, (int)dst->mipLevel,
        (int)dst->origin.x, (int)dst->origin.y, (int)dst->origin.z, (int)dst->aspect,
        data, (int)dataSize, (int)layout->offset, (int)layout->bytesPerRow, (int)layout->rowsPerImage,
        (int)size->width, (int)size->height, (int)size->depthOrArrayLayers);
}

void wgpuCommandEncoderCopyTextureToBuffer(WGPUCommandEncoder enc,
        const WGPUTexelCopyTextureInfo *src, const WGPUTexelCopyBufferInfo *dst, const WGPUExtent3D *copySize) {
    __wgpu_cmd_copy_texture_to_buffer((int)enc, (int)src->texture, (int)src->mipLevel,
        (int)src->origin.x, (int)src->origin.y, (int)src->origin.z,
        (int)dst->buffer, (int)dst->layout.offset, (int)dst->layout.bytesPerRow, (int)dst->layout.rowsPerImage,
        (int)copySize->width, (int)copySize->height, (int)copySize->depthOrArrayLayers);
}

WGPUFuture wgpuBufferMapAsync(WGPUBuffer buffer, WGPUMapMode mode, size_t offset, size_t size,
        WGPUBufferMapCallbackInfo callbackInfo) {
    __wgpu_buffer_map_async((int)buffer, (int)mode, (int)offset, (int)size,
        callbackInfo.callback, callbackInfo.userdata1, callbackInfo.userdata2);
    WGPUFuture f; f.id = ++__wgpu_future_seq; return f;
}

/* Mapped-range staging: getMappedRange mallocs a wasm-side copy of the mapped
   GPU bytes (host fills it via __wgpu_buffer_get_mapped_range for the read
   path). The host also remembers the JS range so wgpuBufferUnmap flushes the
   staging bytes back into the GPU buffer (write path / mappedAtCreation) before
   the staging is freed. */
#define __WGPU_MAX_MAPPED 16
static struct { int buffer; void *ptr; } __wgpu_mapped[__WGPU_MAX_MAPPED];

void *wgpuBufferGetMappedRange(WGPUBuffer buffer, size_t offset, size_t size) {
    /* WGPU_WHOLE_SIZE / WGPU_WHOLE_MAP_SIZE truncate to (size_t)-1 in ILP32:
       resolve to "rest of buffer" BEFORE allocating the staging copy (the host
       side gets a concrete size, mirroring the setVertex/IndexBuffer paths). */
    if (size == (size_t)-1) size = (size_t)__wgpu_buffer_get_size((int)buffer) - offset;
    void *p = malloc(size ? size : 1);
    if (!p) { fprintf(stderr, "wgpuBufferGetMappedRange: out of memory\\n"); abort(); }
    __wgpu_buffer_get_mapped_range((int)buffer, (int)offset, (int)size, p);
    for (int i = 0; i < __WGPU_MAX_MAPPED; i++) {
        if (!__wgpu_mapped[i].ptr) { __wgpu_mapped[i].buffer = (int)buffer; __wgpu_mapped[i].ptr = p; return p; }
    }
    fprintf(stderr, "wgpuBufferGetMappedRange: too many mapped buffers (raise __WGPU_MAX_MAPPED)\\n");
    abort();
}

const void *wgpuBufferGetConstMappedRange(WGPUBuffer buffer, size_t offset, size_t size) {
    return wgpuBufferGetMappedRange(buffer, offset, size);
}

void wgpuBufferUnmap(WGPUBuffer buffer) {
    /* Unmap FIRST: the host flushes the wasm staging bytes back into the GPU
       mapped range (write path / mappedAtCreation) before unmapping. Only then
       is it safe to free the staging copy. */
    __wgpu_buffer_unmap((int)buffer);
    for (int i = 0; i < __WGPU_MAX_MAPPED; i++) {
        if (__wgpu_mapped[i].ptr && __wgpu_mapped[i].buffer == (int)buffer) {
            free(__wgpu_mapped[i].ptr);
            __wgpu_mapped[i].ptr = 0;
            __wgpu_mapped[i].buffer = 0;
        }
    }
}

void wgpuCommandEncoderCopyBufferToBuffer(WGPUCommandEncoder enc, WGPUBuffer src,
        uint64_t srcOffset, WGPUBuffer dst, uint64_t dstOffset, uint64_t size) {
    __wgpu_cmd_copy_buffer_to_buffer((int)enc, (int)src, (int)srcOffset, (int)dst, (int)dstOffset, (int)size);
}

WGPUComputePipeline wgpuDeviceCreateComputePipeline(WGPUDevice device, const WGPUComputePipelineDescriptor *desc) {
    static int csc[1 + 64 * 2]; static double cscv[64];
    int cscn = __wgpu_pack_constants(desc->compute.constants, (int)desc->compute.constantCount, csc, cscv, (int)(sizeof(csc) / sizeof(csc[0])));
    return (WGPUComputePipeline)__wgpu_device_create_compute_pipeline((int)device,
        (int)desc->compute.module, desc->compute.entryPoint.data, (int)desc->compute.entryPoint.length,
        (int)desc->layout, csc, cscn, cscv);
}

WGPUComputePassEncoder wgpuCommandEncoderBeginComputePass(WGPUCommandEncoder enc, const WGPUComputePassDescriptor *desc) {
    (void)desc;
    return (WGPUComputePassEncoder)__wgpu_command_encoder_begin_compute_pass((int)enc);
}

void wgpuComputePassEncoderSetPipeline(WGPUComputePassEncoder pass, WGPUComputePipeline pipeline) {
    __wgpu_compute_pass_set_pipeline((int)pass, (int)pipeline);
}

void wgpuComputePassEncoderSetBindGroup(WGPUComputePassEncoder pass, uint32_t groupIndex,
        WGPUBindGroup group, size_t dynamicOffsetCount, const uint32_t *dynamicOffsets) {
    __wgpu_compute_pass_set_bind_group((int)pass, (int)groupIndex, (int)group,
        (const int *)dynamicOffsets, (int)dynamicOffsetCount);
}

void wgpuComputePassEncoderDispatchWorkgroups(WGPUComputePassEncoder pass,
        uint32_t workgroupCountX, uint32_t workgroupCountY, uint32_t workgroupCountZ) {
    __wgpu_compute_pass_dispatch((int)pass, (int)workgroupCountX, (int)workgroupCountY, (int)workgroupCountZ);
}

void wgpuComputePassEncoderEnd(WGPUComputePassEncoder pass) {
    __wgpu_compute_pass_end((int)pass);
}

void wgpuDevicePushErrorScope(WGPUDevice device, WGPUErrorFilter filter) {
    __wgpu_device_push_error_scope((int)device, (int)filter);
}

WGPUFuture wgpuDevicePopErrorScope(WGPUDevice device, WGPUPopErrorScopeCallbackInfo callbackInfo) {
    __wgpu_device_pop_error_scope((int)device, callbackInfo.callback, callbackInfo.userdata1, callbackInfo.userdata2);
    WGPUFuture f; f.id = ++__wgpu_future_seq; return f;
}

void wgpuInstanceRelease(WGPUInstance v) { __wgpu_release((int)v); }
void wgpuAdapterRelease(WGPUAdapter v) { __wgpu_release((int)v); }
void wgpuDeviceRelease(WGPUDevice v) { __wgpu_release((int)v); }
void wgpuQueueRelease(WGPUQueue v) { __wgpu_release((int)v); }
void wgpuSurfaceRelease(WGPUSurface v) { __wgpu_release((int)v); }
void wgpuTextureRelease(WGPUTexture v) { __wgpu_release((int)v); }
void wgpuTextureViewRelease(WGPUTextureView v) { __wgpu_release((int)v); }
void wgpuShaderModuleRelease(WGPUShaderModule v) { __wgpu_release((int)v); }
void wgpuRenderPipelineRelease(WGPURenderPipeline v) { __wgpu_release((int)v); }
void wgpuCommandEncoderRelease(WGPUCommandEncoder v) { __wgpu_release((int)v); }
void wgpuRenderPassEncoderRelease(WGPURenderPassEncoder v) { __wgpu_release((int)v); }
void wgpuCommandBufferRelease(WGPUCommandBuffer v) { __wgpu_release((int)v); }
void wgpuBufferRelease(WGPUBuffer v) { __wgpu_release((int)v); }
void wgpuBindGroupLayoutRelease(WGPUBindGroupLayout v) { __wgpu_release((int)v); }
void wgpuBindGroupRelease(WGPUBindGroup v) { __wgpu_release((int)v); }
void wgpuPipelineLayoutRelease(WGPUPipelineLayout v) { __wgpu_release((int)v); }
void wgpuSamplerRelease(WGPUSampler v) { __wgpu_release((int)v); }
void wgpuComputePipelineRelease(WGPUComputePipeline v) { __wgpu_release((int)v); }
void wgpuComputePassEncoderRelease(WGPUComputePassEncoder v) { __wgpu_release((int)v); }

void wgpuSetMainLoopCallback(void (*callback)(void)) {
    __sdl_set_animation_frame_func(callback);
}
  `,
  "__SDL_popup.c": `
#include <SDL_popup.h>
#include <__SDL_internal.h>
#include <stdlib.h>
#include <string.h>

/* Stock SDL3 popup windows + display bounds (todos/0256) — its own TU (see
   SDL_popup.h) so these two imports never land in a non-popup binary's
   import table. */

/* Anchored popup window: parent_handle names the parent window, dx/dy the
   anchor offset in parent client coords; flags carry POPUP_MENU/TOOLTIP so
   the host maps the kernel grab. Returns a handle in the SAME space as
   __sdl_create_window (one per-handle table), 0 on failure. */
__import int __sdl_create_popup_window(int parent_handle, int dx, int dy, int w, int h, int flags);
/* Screen dims packed (w << 16) | h, 0 = no display authority. */
__import int __sdl_get_display_bounds(void);

/* An anchored child surface under the OS WM — pinned to the parent,
   chrome-free, never focused, dismissed via SDL_EVENT_WINDOW_CLOSE_REQUESTED
   when a POPUP_MENU grab is broken by an outside press. The returned
   SDL_Window is ordinary in every other way (GetWindowSurface /
   UpdateWindowSurface / SetWindowSize / DestroyWindow all work per-handle;
   registration below keeps RESIZED surface re-derivation working). */
SDL_Window *SDL_CreatePopupWindow(SDL_Window *parent, int offset_x, int offset_y,
                                  int w, int h, SDL_WindowFlags flags) {
    if (!parent) { SDL_SetError("SDL_CreatePopupWindow: parent is NULL"); return NULL; }
    if (!(flags & (SDL_WINDOW_POPUP_MENU | SDL_WINDOW_TOOLTIP))) {
        /* SDL3 contract: a popup must declare which kind it is. */
        SDL_SetError("SDL_CreatePopupWindow: flags must include SDL_WINDOW_POPUP_MENU or SDL_WINDOW_TOOLTIP");
        return NULL;
    }
    int handle = __sdl_create_popup_window(parent->handle, offset_x, offset_y, w, h, (int)flags);
    if (handle <= 0) { SDL_SetError("SDL_CreatePopupWindow: this runtime cannot create popup windows"); return NULL; }
    int pitch = w * 4;
    SDL_Window *win = (SDL_Window *)malloc(sizeof(SDL_Window));
    if (!win) { SDL_SetError("Out of memory"); return NULL; }
    win->handle = handle;
    win->surface.flags = 0;
    win->surface.format = SDL_PIXELFORMAT_RGBA32;
    win->surface.w = w;
    win->surface.h = h;
    win->surface.pitch = pitch;
    win->surface.refcount = 1;
    win->surface.reserved = NULL;
    win->surface.pixels = malloc(pitch * h);
    if (!win->surface.pixels) { free(win); SDL_SetError("Out of memory"); return NULL; }
    memset(win->surface.pixels, 0, pitch * h);
    win->pixels_cap = pitch * h;
    win->relative_mouse = 0;
    /* Slot into __SDL.c's registry directly (see __SDL_internal.h): RESIZED
       re-derivation and per-window close routing then cover popups exactly
       like top-levels. Past the cap the window still works, it just never
       re-derives on resize — the __SDL.c rule, verbatim. */
    for (int i = 0; i < __SDL_MAX_WINDOWS; i++) {
        if (!__sdl_window_registry[i]) { __sdl_window_registry[i] = win; break; }
    }
    return win;
}

/* The OS screen as ONE synthetic display at origin 0,0 (displayID ignored).
   Reads the kernel-published dims with zero RPCs; fails loud where no
   window system exists. */
bool SDL_GetDisplayBounds(Uint32 displayID, SDL_Rect *rect) {
    (void)displayID;
    if (!rect) return SDL_SetError("SDL_GetDisplayBounds: rect is NULL");
    int packed = __sdl_get_display_bounds();
    if (packed <= 0)
        return SDL_SetError("SDL_GetDisplayBounds: no display authority in this runtime");
    rect->x = 0;
    rect->y = 0;
    rect->w = (packed >> 16) & 0xFFFF;
    rect->h = packed & 0xFFFF;
    return 1;
}

  `,
  "__sdl3webgpu.c": `
#include <sdl3webgpu.h>

__import int __wgpu_instance_create_surface_for_window(int instance, int window);

WGPUSurface SDL_GetWGPUSurface(WGPUInstance instance, SDL_Window *window) {
    /* Per-window GPU present binding (A4): the window's HOST handle (its
       SDL_WindowID) crosses the import so the host binds THIS surface's
       presents to THIS window's kernel surface, symmetric with the shm
       per-window path. Handle-less wgpuInstanceCreateSurface keeps the
       legacy shared-canvas tail. */
    if (!window) return NULL;
    return (WGPUSurface)__wgpu_instance_create_surface_for_window(
        (int)instance, (int)SDL_GetWindowID(window));
}
  `,
  "__alloca.c": `
void *alloca(long size) {
  return __builtin(alloca, size);
}
  `,
  "__setjmp.c": `
int __setjmp_id_counter;
  `,
  "__assert.c": `
#include <stdio.h>

#include <stdlib.h>

void __assert_fail(const char *expr, const char *file, int line) {
  fprintf(stderr, "Assertion failed: %s, file %s, line %d\\n", expr, file, line);
  abort();
}
  `,
  "__atexit.c": `
static void (*__atexit_funcs[32])(void);
static int __atexit_count = 0;

int atexit(void (*func)(void)) {
  if (__atexit_count >= 32) return -1;
  __atexit_funcs[__atexit_count++] = func;
  return 0;
}

void __run_atexits(void) {
  while (__atexit_count > 0)
    __atexit_funcs[--__atexit_count]();
}
__export __run_atexits = __run_atexits;
  `,
  "__ctype.c": `
int isdigit(int c) { return c >= '0' && c <= '9'; }
int islower(int c) { return c >= 'a' && c <= 'z'; }
int isupper(int c) { return c >= 'A' && c <= 'Z'; }
int isalpha(int c) { return islower(c) || isupper(c); }
int isalnum(int c) { return isalpha(c) || isdigit(c); }
int isblank(int c) { return c == ' ' || c == '\\t'; }
int iscntrl(int c) { return (c >= 0 && c < 32) || c == 127; }
int isprint(int c) { return c >= 32 && c <= 126; }
int isgraph(int c) { return c > 32 && c <= 126; }
int isspace(int c) {
  return c == ' ' || c == '\\t' || c == '\\n' ||
       c == '\\r' || c == '\\f' || c == '\\v';
}
int ispunct(int c) { return isgraph(c) && !isalnum(c); }
int isxdigit(int c) {
  return isdigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}
int tolower(int c) { return isupper(c) ? c + ('a' - 'A') : c; }
int toupper(int c) { return islower(c) ? c + ('A' - 'a') : c; }
  `,
  "__wchar.c": `
#include <stddef.h>

/* --- wctype functions (ASCII baseline) --- */
int iswalpha(unsigned int c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'); }
int iswupper(unsigned int c) { return c >= 'A' && c <= 'Z'; }
int iswlower(unsigned int c) { return c >= 'a' && c <= 'z'; }
int iswdigit(unsigned int c) { return c >= '0' && c <= '9'; }
int iswalnum(unsigned int c) { return iswalpha(c) || iswdigit(c); }
int iswblank(unsigned int c) { return c == ' ' || c == '\\t'; }
int iswspace(unsigned int c) {
  return c == ' ' || c == '\\t' || c == '\\n' ||
         c == '\\r' || c == '\\f' || c == '\\v';
}
int iswcntrl(unsigned int c) { return (c < 32) || c == 127; }
int iswprint(unsigned int c) { return c >= 32 && c <= 126; }
int iswgraph(unsigned int c) { return c > 32 && c <= 126; }
int iswpunct(unsigned int c) { return iswgraph(c) && !iswalnum(c); }
int iswxdigit(unsigned int c) {
  return iswdigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}
unsigned int towlower(unsigned int c) { return iswupper(c) ? c + ('a' - 'A') : c; }
unsigned int towupper(unsigned int c) { return iswlower(c) ? c + ('A' - 'a') : c; }

/* --- wctype()/iswctype(): POSIX character-class lookup + test (C95) ---
   wctype(name) returns a 1-based class id (0 = unknown); iswctype dispatches
   to the matching isw* predicate. Used by POSIX regex [[:class:]] handling. */
typedef int wctype_t;
static int __wctype_streq(const char *a, const char *b) {
  while (*a && *a == *b) { a++; b++; }
  return *a == 0 && *b == 0;
}
wctype_t wctype(const char *name) {
  static const char *names[] = {
    "alnum", "alpha", "blank", "cntrl", "digit", "graph",
    "lower", "print", "punct", "space", "upper", "xdigit", 0
  };
  if (name == 0) return 0;
  for (int i = 0; names[i]; i++) if (__wctype_streq(name, names[i])) return i + 1;
  return 0;
}
int iswctype(unsigned int c, wctype_t type) {
  switch (type) {
    case 1:  return iswalnum(c);
    case 2:  return iswalpha(c);
    case 3:  return iswblank(c);
    case 4:  return iswcntrl(c);
    case 5:  return iswdigit(c);
    case 6:  return iswgraph(c);
    case 7:  return iswlower(c);
    case 8:  return iswprint(c);
    case 9:  return iswpunct(c);
    case 10: return iswspace(c);
    case 11: return iswupper(c);
    case 12: return iswxdigit(c);
  }
  return 0;
}

/* --- wchar string functions --- */
size_t wcslen(const wchar_t *s) {
  size_t len = 0;
  while (s[len]) len++;
  return len;
}
wchar_t *wcscpy(wchar_t *dest, const wchar_t *src) {
  size_t i = 0;
  while (src[i]) { dest[i] = src[i]; i++; }
  dest[i] = 0;
  return dest;
}
wchar_t *wcsncpy(wchar_t *dest, const wchar_t *src, size_t n) {
  size_t i = 0;
  while (i < n && src[i]) { dest[i] = src[i]; i++; }
  while (i < n) { dest[i] = 0; i++; }
  return dest;
}
int wcscmp(const wchar_t *s1, const wchar_t *s2) {
  while (*s1 && *s1 == *s2) { s1++; s2++; }
  return *s1 - *s2;
}
int wcsncmp(const wchar_t *s1, const wchar_t *s2, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (s1[i] != s2[i] || !s1[i]) return s1[i] - s2[i];
  }
  return 0;
}
wchar_t *wcscat(wchar_t *dest, const wchar_t *src) {
  wchar_t *p = dest;
  while (*p) p++;
  while (*src) { *p = *src; p++; src++; }
  *p = 0;
  return dest;
}
wchar_t *wcsncat(wchar_t *dest, const wchar_t *src, size_t n) {
  wchar_t *p = dest;
  while (*p) p++;
  while (n-- && *src) { *p++ = *src++; }
  *p = 0;
  return dest;
}
wchar_t *wcschr(const wchar_t *s, wchar_t c) {
  while (*s) {
    if (*s == c) return (wchar_t *)s;
    s++;
  }
  if (c == 0) return (wchar_t *)s;
  return (wchar_t *)0;
}
wchar_t *wcsrchr(const wchar_t *s, wchar_t c) {
  const wchar_t *last = (const wchar_t *)0;
  while (*s) {
    if (*s == c) last = s;
    s++;
  }
  if (c == 0) return (wchar_t *)s;
  return (wchar_t *)last;
}
wchar_t *wcsstr(const wchar_t *haystack, const wchar_t *needle) {
  if (!*needle) return (wchar_t *)haystack;
  while (*haystack) {
    const wchar_t *h = haystack;
    const wchar_t *n = needle;
    while (*h && *n && *h == *n) { h++; n++; }
    if (!*n) return (wchar_t *)haystack;
    haystack++;
  }
  return (wchar_t *)0;
}
size_t wcsspn(const wchar_t *s, const wchar_t *accept) {
  size_t count = 0;
  while (*s) {
    const wchar_t *a = accept;
    int found = 0;
    while (*a) { if (*s == *a) { found = 1; break; } a++; }
    if (!found) break;
    s++; count++;
  }
  return count;
}
size_t wcscspn(const wchar_t *s, const wchar_t *reject) {
  size_t count = 0;
  while (*s) {
    const wchar_t *r = reject;
    while (*r) { if (*s == *r) return count; r++; }
    s++; count++;
  }
  return count;
}
wchar_t *wcspbrk(const wchar_t *s, const wchar_t *accept) {
  while (*s) {
    const wchar_t *a = accept;
    while (*a) { if (*s == *a) return (wchar_t *)s; a++; }
    s++;
  }
  return (wchar_t *)0;
}
wchar_t *wcstok(wchar_t *str, const wchar_t *delim, wchar_t **saveptr) {
  if (str) *saveptr = str;
  if (!*saveptr) return (wchar_t *)0;
  *saveptr += wcsspn(*saveptr, delim);
  if (!**saveptr) { *saveptr = (wchar_t *)0; return (wchar_t *)0; }
  wchar_t *tok = *saveptr;
  *saveptr += wcscspn(*saveptr, delim);
  if (**saveptr) { **saveptr = 0; (*saveptr)++; }
  else { *saveptr = (wchar_t *)0; }
  return tok;
}
int wcscoll(const wchar_t *s1, const wchar_t *s2) { return wcscmp(s1, s2); }
size_t wcsxfrm(wchar_t *dest, const wchar_t *src, size_t n) {
  size_t len = wcslen(src);
  if (n > 0) {
    size_t copy = len < n ? len : n - 1;
    for (size_t i = 0; i < copy; i++) dest[i] = src[i];
    dest[copy] = 0;
  }
  return len;
}

/* --- wmem functions --- */
wchar_t *wmemcpy(wchar_t *dest, const wchar_t *src, size_t n) {
  for (size_t i = 0; i < n; i++) dest[i] = src[i];
  return dest;
}
wchar_t *wmemmove(wchar_t *dest, const wchar_t *src, size_t n) {
  if (dest < src) { for (size_t i = 0; i < n; i++) dest[i] = src[i]; }
  else { for (size_t i = n; i > 0; i--) dest[i-1] = src[i-1]; }
  return dest;
}
wchar_t *wmemset(wchar_t *dest, wchar_t c, size_t n) {
  for (size_t i = 0; i < n; i++) dest[i] = c;
  return dest;
}
int wmemcmp(const wchar_t *s1, const wchar_t *s2, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (s1[i] != s2[i]) return s1[i] - s2[i];
  }
  return 0;
}
wchar_t *wmemchr(const wchar_t *s, wchar_t c, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (s[i] == c) return (wchar_t *)(s + i);
  }
  return (wchar_t *)0;
}

/* --- multibyte/wide conversions (UTF-8) --- */
#include <wchar.h>
unsigned int btowc(int c) { return (c >= 0 && c <= 0x7F) ? (unsigned int)c : (unsigned int)-1; }
int wctob(unsigned int c) { return (c <= 0x7F) ? (int)c : -1; }
int mbsinit(const mbstate_t *ps) { (void)ps; return 1; }

/* The actual UTF-8 codec lives in __stdlib.c (shared with the
   non-restartable mbtowc/wctomb family — C11 7.22.7 requires one
   consistent encoding). UTF-8 is stateless, so ps is unused. */
size_t __mbrtowc_utf8(wchar_t *pwc, const char *s, size_t n);
size_t __wcrtomb_utf8(char *s, wchar_t wc);

size_t wcrtomb(char *s, wchar_t wc, mbstate_t *ps) {
  (void)ps;
  return __wcrtomb_utf8(s, wc);
}

size_t mbrtowc(wchar_t *pwc, const char *s, size_t n, mbstate_t *ps) {
  (void)ps;
  return __mbrtowc_utf8(pwc, s, n);
}
  `,
  "__dirent.c": `
#include <dirent.h>
#include <stdlib.h>
#include <string.h>

__import int __opendir(const char *name);
__import int __readdir(int handle, void *dirent_buf);
__import int __closedir(int handle);

struct __DIR {
  int fd;
  struct dirent ent;
  char name[1024]; /* retained for rewinddir (no host rewind import) */
};

DIR *opendir(const char *name) {
  int handle = __opendir(name);
  if (handle < 0) return (DIR *)0;
  DIR *dirp = (DIR *)malloc(sizeof(DIR));
  if (!dirp) { __closedir(handle); return (DIR *)0; }
  dirp->fd = handle;
  dirp->name[0] = 0;
  if (name) {
    size_t n = strlen(name);
    if (n < sizeof(dirp->name)) memcpy(dirp->name, name, n + 1);
  }
  return dirp;
}

int closedir(DIR *dirp) {
  if (!dirp) return -1;
  int ret = __closedir(dirp->fd);
  free(dirp);
  return ret;
}

struct dirent *readdir(DIR *dirp) {
  if (!dirp) return (struct dirent *)0;
  int result = __readdir(dirp->fd, &dirp->ent);
  if (result < 0) return (struct dirent *)0;
  return &dirp->ent;
}

/* POSIX rewinddir: reset the stream to the start. With no host rewind
   import, re-open the directory by the name captured at opendir. */
void rewinddir(DIR *dirp) {
  if (!dirp || !dirp->name[0]) return;
  int handle = __opendir(dirp->name);
  if (handle < 0) return;
  __closedir(dirp->fd);
  dirp->fd = handle;
}
  `,
  "__emscripten.c": `
#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
__import void __sdl_set_animation_frame_func(void (*callback)(void));
__import void __emscripten_async_call(void (*func)(void *), void *arg, int millis);
__import float __emscripten_random(void);

void emscripten_set_main_loop(void (*func)(void), int fps, int simulate_infinite_loop) {
  if (fps != 0) {
    printf("emscripten_set_main_loop: unsupported fps=%d (only 0 is supported)\\n", fps);
    exit(1);
  }
  (void)simulate_infinite_loop;
  __sdl_set_animation_frame_func(func);
}

void emscripten_async_call(void (*func)(void *), void *arg, int millis) {
  __emscripten_async_call(func, arg, millis);
}

float emscripten_random(void) {
  return __emscripten_random();
}
  `,
  "__errno.c": `
int errno;
void __errno_set(int e) { errno = e; }
__export __errno_set = __errno_set;
  `,
  "__getopt.c": `
#include <getopt.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

char *optarg = (void *)0;
int optind = 1;
int opterr = 1;
int optopt = 0;

// Position within the current argv[optind] (0 means we haven't started
// scanning the current arg, so the next call will look at optind fresh).
static int __optpos = 0;

// Skip GNU-mode prefix flags ('+'/'-') and detect the silent ':' flag.
static const char *__skip_modifiers(const char *s, int *silent) {
  if (*s == '+' || *s == '-') s++;
  if (*s == ':') { *silent = 1; s++; }
  return s;
}

// Find character c in optstring (after modifiers stripped).
// Returns pointer to the matching char, or NULL if not found.
static const char *__find_short(int c, const char *optstring) {
  if (c == ':' || c == '?' || c == '\\0') return (void *)0;
  for (const char *p = optstring; *p; p++) {
    if (*p == c) return p;
  }
  return (void *)0;
}

// Strip leading directory components from argv[0] for diagnostic output.
static const char *__progname(int argc, char *const argv[]) {
  if (argc <= 0 || !argv[0]) return "?";
  const char *s = argv[0];
  const char *base = s;
  while (*s) {
    if (*s == '/') base = s + 1;
    s++;
  }
  return base;
}

int getopt(int argc, char *const argv[], const char *optstring) {
  // POSIX/glibc convention: optind == 0 requests a reset of internal state.
  if (optind == 0) { optind = 1; __optpos = 0; }

  optarg = (void *)0;
  int silent = 0;
  const char *opts = __skip_modifiers(optstring, &silent);

  if (__optpos == 0) {
    if (optind >= argc) return -1;
    const char *arg = argv[optind];
    if (!arg || arg[0] != '-' || arg[1] == 0) return -1;
    if (arg[1] == '-' && arg[2] == 0) {
      // "--" terminator: consume and stop option processing
      optind++;
      return -1;
    }
    __optpos = 1;  // skip the leading '-'
  }

  const char *arg = argv[optind];
  int c = (unsigned char)arg[__optpos];
  __optpos++;
  int reached_end = (arg[__optpos] == 0);

  const char *match = __find_short(c, opts);

  if (!match) {
    if (reached_end) { optind++; __optpos = 0; }
    if (opterr && !silent) {
      fprintf(stderr, "%s: invalid option -- '%c'\\n", __progname(argc, argv), c);
    }
    optopt = c;
    return '?';
  }

  if (match[1] != ':') {
    // No argument
    if (reached_end) { optind++; __optpos = 0; }
    return c;
  }

  // Has an argument (required if "x:", optional if "x::")
  int optional = (match[2] == ':');

  if (!reached_end) {
    optarg = (char *)&arg[__optpos];
    optind++;
    __optpos = 0;
    return c;
  }

  // Argument is in the next argv element (or missing)
  __optpos = 0;
  optind++;

  if (optional) return c;  // optional and not given

  if (optind >= argc) {
    if (opterr && !silent) {
      fprintf(stderr, "%s: option requires an argument -- '%c'\\n", __progname(argc, argv), c);
    }
    optopt = c;
    return silent ? ':' : '?';
  }

  optarg = argv[optind++];
  return c;
}

// --- Long-option core (shared by getopt_long / getopt_long_only) -------

static int __getopt_long_core(int argc, char *const argv[], const char *optstring,
                              const struct option *longopts, int *longindex,
                              int allow_dash) {
  if (optind == 0) { optind = 1; __optpos = 0; }

  // Mid-arg short-option chain: continue scanning short.
  if (__optpos != 0) {
    return getopt(argc, argv, optstring);
  }

  if (optind >= argc) return -1;
  const char *arg = argv[optind];
  if (!arg || arg[0] != '-' || arg[1] == 0) return -1;

  // "--" terminator
  if (arg[1] == '-' && arg[2] == 0) {
    optind++;
    return -1;
  }

  int silent = 0;
  __skip_modifiers(optstring, &silent);

  // Determine where the long-option name starts.
  // "--name..." → always treated as long.
  // "-name..."  → treated as long only in long_only mode.
  const char *name;
  int double_dash = (arg[1] == '-');
  if (double_dash) {
    name = arg + 2;
  } else if (allow_dash) {
    name = arg + 1;
  } else {
    return getopt(argc, argv, optstring);
  }

  // Split out "=value" if present.
  const char *eq = strchr(name, '=');
  size_t namelen = eq ? (size_t)(eq - name) : strlen(name);

  // Match against longopts: prefer exact match, else unambiguous prefix.
  int match_idx = -1;
  int exact = 0;
  int ambig = 0;
  for (int i = 0; longopts[i].name; i++) {
    if (strncmp(longopts[i].name, name, namelen) == 0) {
      if (strlen(longopts[i].name) == namelen) {
        match_idx = i;
        exact = 1;
        ambig = 0;
        break;
      }
      if (match_idx == -1) match_idx = i;
      else ambig = 1;
    }
  }

  // In long-only mode, if no exact long match, fall back to short option
  // processing (so "-h" with optstring "h" works even if there's no long
  // option named "h").
  if (allow_dash && !double_dash && !exact) {
    return getopt(argc, argv, optstring);
  }

  if (ambig) {
    if (opterr && !silent) {
      fprintf(stderr, "%s: option '%s%.*s' is ambiguous\\n",
              __progname(argc, argv), double_dash ? "--" : "-", (int)namelen, name);
    }
    optind++;
    optopt = 0;
    return '?';
  }

  if (match_idx == -1) {
    if (opterr && !silent) {
      fprintf(stderr, "%s: unrecognized option '%s%s'\\n",
              __progname(argc, argv), double_dash ? "--" : "-", name);
    }
    optind++;
    optopt = 0;
    return '?';
  }

  const struct option *lo = &longopts[match_idx];
  if (longindex) *longindex = match_idx;

  optarg = (void *)0;

  if (lo->has_arg == required_argument || lo->has_arg == optional_argument) {
    if (eq) {
      optarg = (char *)(eq + 1);
      optind++;
    } else if (lo->has_arg == required_argument) {
      optind++;
      if (optind >= argc) {
        if (opterr && !silent) {
          fprintf(stderr, "%s: option '--%s' requires an argument\\n",
                  __progname(argc, argv), lo->name);
        }
        optopt = lo->val;
        return silent ? ':' : '?';
      }
      optarg = argv[optind++];
    } else {
      // optional_argument and not given
      optind++;
    }
  } else {
    // no_argument
    if (eq) {
      if (opterr && !silent) {
        fprintf(stderr, "%s: option '--%s' doesn't allow an argument\\n",
                __progname(argc, argv), lo->name);
      }
      optind++;
      optopt = lo->val;
      return '?';
    }
    optind++;
  }

  if (lo->flag) {
    *lo->flag = lo->val;
    return 0;
  }
  return lo->val;
}

int getopt_long(int argc, char *const argv[], const char *optstring,
                const struct option *longopts, int *longindex) {
  return __getopt_long_core(argc, argv, optstring, longopts, longindex, 0);
}

int getopt_long_only(int argc, char *const argv[], const char *optstring,
                     const struct option *longopts, int *longindex) {
  return __getopt_long_core(argc, argv, optstring, longopts, longindex, 1);
}
  `,
  "__signal.c": `
#include <signal.h>
#include <errno.h>
#include <stddef.h>
#include <unistd.h>   /* getpid */
#include <sys/time.h> /* struct itimerval / ITIMER_REAL (todos/0044) */
__import void __exit(int status);

/* Per-process disposition state (the libc owns it — sigaction set it here).
   A running wasm instance can't be preempted, so delivery happens at SAFE
   POINTS: raise()/abort() deliver synchronously, and with a kernel attached
   (kernel.js) the host claims kernel-posted signals at every syscall
   boundary and calls the exported __sig_dispatch (todos/KERNEL.md Phase 2).
   The runtime is told the disposition KIND via __on_sigdisp so kill()
   applies the right action, and the blocked mask via __on_sigmask so the
   kernel parks blocked signals as pending. Pure-compute loops never reach a
   safe point — settled caveat, SIGKILL still works. */
static __sighandler_t __sig_h[NSIG];                       /* SIG_DFL = 0 */
static void (*__sig_a[NSIG])(int, siginfo_t *, void *);    /* SA_SIGINFO action */
static int __sig_fl[NSIG];
static sigset_t __sig_blocked;
static sigset_t __sig_pending;

static int __sig_ok(int s) { return s > 0 && s < NSIG; }
static int __sig_uncatchable(int s) { return s == SIGKILL || s == SIGSTOP; }

/* Default action: 0=terminate 1=ignore 2=stop 3=continue. (if-chains, not a
   switch, so this doesn't perturb the compiler's br_table-strategy golden when
   __signal.c links into every stdlib-using program via abort.) */
static int __sig_default_action(int s) {
  if (s == SIGCHLD || s == SIGURG || s == SIGWINCH) return 1;
  if (s == SIGCONT) return 3;
  if (s == SIGSTOP || s == SIGTSTP || s == SIGTTIN || s == SIGTTOU) return 2;
  return 0;
}

/* Disposition kind for the runtime mirror: 0=DFL 1=IGN 2=HANDLER. */
static int __sig_kind(int s) {
  if (__sig_a[s]) return 2;
  if (__sig_h[s] == SIG_DFL) return 0;
  if (__sig_h[s] == SIG_IGN) return 1;
  return 2;
}

/* Counts user-visible deliveries (handler invocations). sigsuspend() uses it
   to detect that unblocking already delivered — POSIX says it must return
   then, not park for a second signal. */
static volatile int __sig_ncalls;

/* Deliver one signal to this process's tables right now. Async deliveries
   (host safe-point dispatch, unblock drains, kill(getpid(), sig)) park
   blocked signals in __sig_pending; raise() keeps its historical synchronous
   semantics and does not consult the mask (C11 raise; matches the existing
   goldens). Returns nonzero when an interrupted primitive may transparently
   restart: SA_RESTART on the action that ran, or nothing user-visible ran. */
static int __sig_deliver(int sig, int async) {
  if (async && (__sig_blocked & ((sigset_t)1 << (sig - 1)))) {
    __sig_pending |= (sigset_t)1 << (sig - 1);
    return 1;
  }
  if (__sig_a[sig]) {
    siginfo_t info; info.si_signo = sig; info.si_code = 0; info.si_errno = 0;
    info.si_pid = getpid(); info.si_uid = 0; info.si_status = 0; info.si_addr = NULL;
    info.si_value.sival_int = 0;
    void (*a)(int, siginfo_t *, void *) = __sig_a[sig];
    int restart = (__sig_fl[sig] & SA_RESTART) != 0;   /* before the handler can sigaction() */
    if (__sig_fl[sig] & SA_RESETHAND) { __sig_a[sig] = NULL; __on_sigdisp(sig, 0); }
    __sig_ncalls++;
    a(sig, &info, NULL);
    return restart;
  }
  __sighandler_t h = __sig_h[sig];
  if (h == SIG_IGN) return 1;
  if (h == SIG_DFL) {
    if (__sig_default_action(sig) != 0) return 1;   /* ignore; stop/cont → todos/0003 */
    /* Terminate: prefer the kernel — kill-self makes the termsig round-trip
       to the parent as WIFSIGNALED. Without a kernel (__spawn_kill ENOSYS
       and returns), approximate with the classic 128+sig exit. */
    __spawn_kill(getpid(), sig);
    __exit(128 + sig);
  }
  int restart = (__sig_fl[sig] & SA_RESTART) != 0;
  if (__sig_fl[sig] & SA_RESETHAND) { __sig_h[sig] = SIG_DFL; __on_sigdisp(sig, 0); }
  __sig_ncalls++;
  h(sig);
  return restart;
}

/* The mask changed: publish it to the kernel page (the host delivers any
   kernel-pending signal that became claimable inside __on_sigmask), then
   drain locally-parked pending signals that are now unblocked. */
static void __sig_mask_changed(void) {
  __on_sigmask((unsigned)__sig_blocked);
  sigset_t ready;
  while ((ready = (__sig_pending & ~__sig_blocked)) != 0) {
    for (int s = 1; s < NSIG; s++) {
      sigset_t b = (sigset_t)1 << (s - 1);
      if (ready & b) { __sig_pending &= ~b; __sig_deliver(s, 1); }
    }
  }
}

/* Host-called safe-point dispatch: kernel.js posted sig on our kernel page
   and host.js claimed it. Returns the may-restart verdict (see
   __sig_deliver) so interrupted waits can honor SA_RESTART. */
int __sig_dispatch(int sig) {
  if (!__sig_ok(sig)) return 1;
  return __sig_deliver(sig, 1);
}
__export __sig_dispatch = __sig_dispatch;

int sigemptyset(sigset_t *set) { if (set) *set = 0; return 0; }
int sigfillset(sigset_t *set) { if (set) *set = ~(sigset_t)0; return 0; }
int sigaddset(sigset_t *set, int sig) {
  if (!__sig_ok(sig)) { errno = EINVAL; return -1; }
  if (set) *set |= (sigset_t)1 << (sig - 1);
  return 0;
}
int sigdelset(sigset_t *set, int sig) {
  if (!__sig_ok(sig)) { errno = EINVAL; return -1; }
  if (set) *set &= ~((sigset_t)1 << (sig - 1));
  return 0;
}
int sigismember(const sigset_t *set, int sig) {
  if (!__sig_ok(sig)) { errno = EINVAL; return -1; }
  return set ? (int)((*set >> (sig - 1)) & 1) : 0;
}

int sigprocmask(int how, const sigset_t *set, sigset_t *oldset) {
  if (oldset) *oldset = __sig_blocked;
  if (set) {
    if (how == SIG_BLOCK) __sig_blocked |= *set;
    else if (how == SIG_UNBLOCK) __sig_blocked &= ~*set;
    else if (how == SIG_SETMASK) __sig_blocked = *set;
    else { errno = EINVAL; return -1; }
    /* SIGKILL/SIGSTOP can never be blocked. */
    __sig_blocked &= ~(((sigset_t)1 << (SIGKILL - 1)) | ((sigset_t)1 << (SIGSTOP - 1)));
    __sig_mask_changed();
  }
  return 0;
}

int sigpending(sigset_t *set) { if (set) *set = __sig_pending; return 0; }

__sighandler_t signal(int sig, __sighandler_t handler) {
  if (!__sig_ok(sig) || __sig_uncatchable(sig)) { errno = EINVAL; return SIG_ERR; }
  __sighandler_t old = __sig_a[sig] ? (__sighandler_t)0 : __sig_h[sig];
  __sig_h[sig] = handler;
  __sig_a[sig] = NULL;
  __sig_fl[sig] = 0;
  __on_sigdisp(sig, __sig_kind(sig));
  return old;
}

int sigaction(int sig, const struct sigaction *act, struct sigaction *oldact) {
  if (!__sig_ok(sig)) { errno = EINVAL; return -1; }
  if (oldact) {
    oldact->sa_handler = __sig_h[sig];
    oldact->sa_sigaction = __sig_a[sig];
    oldact->sa_mask = 0;
    oldact->sa_flags = __sig_fl[sig];
    oldact->sa_restorer = NULL;
  }
  if (act) {
    if (__sig_uncatchable(sig)) { errno = EINVAL; return -1; }
    __sig_fl[sig] = act->sa_flags;
    if (act->sa_flags & SA_SIGINFO) { __sig_a[sig] = act->sa_sigaction; __sig_h[sig] = SIG_DFL; }
    else { __sig_h[sig] = act->sa_handler; __sig_a[sig] = NULL; }
    __on_sigdisp(sig, __sig_kind(sig));
  }
  return 0;
}

/* raise(): synchronous self-delivery (C11). The handler runs right here; a
   default-terminate disposition exits (via kill-self when a kernel exists,
   so the parent sees WIFSIGNALED). Historically mask-blind — kept. */
int raise(int sig) {
  if (!__sig_ok(sig)) { errno = EINVAL; return -1; }
  __sig_deliver(sig, 0);
  return 0;
}

/* pause()/sigsuspend(): park on the kernel doorbell; the host delivers the
   waking signal's handlers inside __sig_pause, so these return EINTR right
   after. Without a kernel __sig_pause reports ENOSYS (never hangs). */
int pause(void) {
  if (__sig_pause() < 0) return -1;   /* errno set by the host */
  errno = EINTR;
  return -1;
}
int sigsuspend(const sigset_t *mask) {
  sigset_t old = __sig_blocked;
  int before = __sig_ncalls;
  __sig_blocked = (mask ? *mask : 0)
    & ~(((sigset_t)1 << (SIGKILL - 1)) | ((sigset_t)1 << (SIGSTOP - 1)));
  __sig_mask_changed();               /* may deliver a newly-unblocked pending signal */
  int r = 0;
  if (__sig_ncalls == before) r = __sig_pause();
  __sig_blocked = old;
  __sig_mask_changed();
  if (r < 0) return -1;
  errno = EINTR;
  return -1;
}

/* kill(): route through the process kernel (kernel.js). Self-directed
   signals deliver locally with async semantics (blocked → pending, handler
   runs before return otherwise) — the kernel round-trip couldn't reach this
   very instance any sooner than we can. */
int kill(int pid, int sig) {
  /* sig 0 is the POSIX existence probe (kill(2)): route + error-check,
     deliver nothing. Only kill() takes it — signal()/sigaction()/raise()
     keep rejecting 0 via __sig_ok. */
  if (sig != 0 && !__sig_ok(sig)) { errno = EINVAL; return -1; }
  if (pid == getpid()) { if (sig != 0) __sig_deliver(sig, 1); return 0; }
  return __spawn_kill(pid, sig);
}
int killpg(int pgrp, int sig) {
  if (pgrp < 0) { errno = EINVAL; return -1; }
  return kill(pgrp == 0 ? 0 : -pgrp, sig);
}

/* ---- interval timers (todos/0044): ITIMER_REAL -> SIGALRM ----
   The kernel owns ONE real-time timer per process (kernel.js; VIRTUAL/PROF
   answer EINVAL — no CPU accounting). The wire ABI is milliseconds; these
   wrappers own the timeval <-> ms conversion. out2/old2 = {value_ms,
   interval_ms} of the PREVIOUS (setitimer) or CURRENT (getitimer) timer. */
__import int __setitimer(int which, unsigned value_ms, unsigned interval_ms, unsigned *old2);
__import int __getitimer(int which, unsigned *out2);

/* timeval -> ms, clamped to INT_MAX ms (~24.8 days — the embedder's timer
   ceiling); nonzero sub-ms rounds UP so an armed value never converts to
   "disarmed". Caller has already range-checked the fields. */
static unsigned __itimer_tv2ms(const struct timeval *tv) {
  if (tv->tv_sec > 2147483) return 2147483647u;
  long long ms = tv->tv_sec * 1000LL + ((long long)tv->tv_usec + 999) / 1000;
  return ms > 2147483647LL ? 2147483647u : (unsigned)ms;
}
static void __itimer_ms2tv(unsigned ms, struct timeval *tv) {
  tv->tv_sec = ms / 1000u;
  tv->tv_usec = (long)(ms % 1000u) * 1000;
}

int setitimer(int which, const struct itimerval *nv, struct itimerval *ov) {
  if (!nv || nv->it_value.tv_sec < 0 || nv->it_interval.tv_sec < 0 ||
      nv->it_value.tv_usec < 0 || nv->it_value.tv_usec > 999999 ||
      nv->it_interval.tv_usec < 0 || nv->it_interval.tv_usec > 999999) {
    errno = EINVAL;
    return -1;
  }
  unsigned old[2];
  if (__setitimer(which, __itimer_tv2ms(&nv->it_value),
                  __itimer_tv2ms(&nv->it_interval), old) < 0) return -1;
  if (ov) {
    __itimer_ms2tv(old[0], &ov->it_value);
    __itimer_ms2tv(old[1], &ov->it_interval);
  }
  return 0;
}

int getitimer(int which, struct itimerval *cur) {
  if (!cur) { errno = EINVAL; return -1; }
  unsigned v[2];
  if (__getitimer(which, v) < 0) return -1;
  __itimer_ms2tv(v[0], &cur->it_value);
  __itimer_ms2tv(v[1], &cur->it_interval);
  return 0;
}

/* POSIX alarm() cannot report failure; without a kernel (__setitimer
   ENOSYS) it returns 0 and the timer simply never fires — consistent with
   the rest of the spawn/signal surface failing loud only where an error
   return exists. Seconds remaining round UP (a still-armed alarm never
   reports 0). */
unsigned alarm(unsigned seconds) {
  unsigned ms = seconds > 2147483u ? 2147483647u : seconds * 1000u;
  unsigned old[2];
  if (__setitimer(ITIMER_REAL, ms, 0, old) < 0) return 0;
  return (old[0] + 999) / 1000;
}

unsigned ualarm(unsigned usecs, unsigned interval) {
  unsigned old[2];
  /* div-then-round (not +999 first): usecs near UINT_MAX must not wrap to
     a tiny value and silently disarm. */
  if (__setitimer(ITIMER_REAL, usecs / 1000 + (usecs % 1000 != 0),
                  interval / 1000 + (interval % 1000 != 0), old) < 0) return 0;
  return old[0] > 4294967u ? 4294967295u : old[0] * 1000u;
}
  `,
  "__locale.c": `
#include <locale.h>
#include <langinfo.h>
#include <string.h>

static struct lconv __c_lconv = {
  ".",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  127,
  127,
  127,
  127,
  127,
  127,
  127,
  127,
};

/* The libc's charset is UTF-8 unconditionally (the real mb/wc UTF-8
   codec, MB_CUR_MAX 4) — "C" and "C.UTF-8" differ only in the reported
   name, and "" selects the native locale, which IS C.UTF-8. Apps probe
   exactly this pair (setlocale then nl_langinfo(CODESET)) to key
   UTF-8-aware behavior, so the probe must succeed. */
static char __locale_name[12] = "C";

char *setlocale(int category, const char *locale) {
  if (locale == 0) return __locale_name;
  if (locale[0] == '\\0' || strcmp(locale, "C.UTF-8") == 0) {
    strcpy(__locale_name, "C.UTF-8");
    return __locale_name;
  }
  if (strcmp(locale, "C") == 0 || strcmp(locale, "POSIX") == 0) {
    strcpy(__locale_name, "C");
    return __locale_name;
  }
  return 0;
}

struct lconv *localeconv(void) {
  return &__c_lconv;
}

/* nl_langinfo: C-locale answers; CODESET pinned to UTF-8 (see above).
   Indices MUST match the <langinfo.h> item constants. */
static const char *__nl_items[] = {
  "UTF-8",                                          /* CODESET */
  "%a %b %e %H:%M:%S %Y", "%m/%d/%y", "%H:%M:%S",   /* D_T_FMT D_FMT T_FMT */
  "%I:%M:%S %p", "AM", "PM",                        /* T_FMT_AMPM AM_STR PM_STR */
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
  "Aug", "Sep", "Oct", "Nov", "Dec",
  ".", "",                                          /* RADIXCHAR THOUSEP */
  "^[yY]", "^[nN]",                                 /* YESEXPR NOEXPR */
  "", "", "", "", "", "",                           /* CRNCYSTR ERA.. ALT_DIGITS */
};

char *nl_langinfo(nl_item item) {
  if (item < 0 || item >= (int)(sizeof __nl_items / sizeof __nl_items[0]))
    return "";
  return (char *)__nl_items[item];
}
  `,
  "__malloc.c": `
#include <__malloc.h>
#include <stdio.h>

// TLSF (Two-Level Segregated Fit) allocator
//
// Block layout (8-byte header):
//   +0: size_and_flags (long) - bits[31:3]=block size/8, bit0=FREE, bit1=PREV_FREE
//   +4: prev_phys (long) - address of previous physical block
// Free blocks additionally store at payload:
//   +8: next_free (long)
//   +12: prev_free (long)

#define FREE_BIT      1
#define PREV_FREE_BIT 2
#define FLAG_BITS     3

#define BLOCK_OVERHEAD  8
#define MIN_BLOCK_SIZE  16
#define BLOCK_ALIGN     8

#define SL_LOG2   4
#define SEARCH_ROUND(size) ((size) + (1 << (31 - __builtin_clz((int)(size)) - SL_LOG2)) - 1)
#define SL_COUNT  (1 << SL_LOG2)
#define FL_SHIFT  4
#define FL_MAX    30
#define FL_COUNT  (FL_MAX - FL_SHIFT + 1)

static long fl_bitmap;
static long sl_bitmap[FL_COUNT];
static long free_heads[FL_COUNT * SL_COUNT];
static long pool_start;
static long pool_end;
static long last_block;
static int  initialized;

static unsigned long block_size(long block) {
  return (unsigned long)(*(long *)block & ~FLAG_BITS);
}

static int block_is_free(long block) {
  return *(long *)block & FREE_BIT;
}

static int block_prev_is_free(long block) {
  return *(long *)block & PREV_FREE_BIT;
}

static long block_prev_phys(long block) {
  return *(long *)(block + 4);
}

static long block_next_phys(long block) {
  return block + block_size(block);
}

static long block_payload(long block) {
  return block + BLOCK_OVERHEAD;
}

static long payload_to_block(long payload) {
  return payload - BLOCK_OVERHEAD;
}

static long block_get_next_free(long block) {
  return *(long *)(block + 8);
}

static void block_set_next_free(long block, long nf) {
  *(long *)(block + 8) = nf;
}

static long block_get_prev_free(long block) {
  return *(long *)(block + 12);
}

static void block_set_prev_free(long block, long pf) {
  *(long *)(block + 12) = pf;
}

// mapping_insert: floor mapping for insertion
static void mapping_insert(long size, int *fl, int *sl) {
  if (size < (1 << (FL_SHIFT + 1))) {
    *fl = 0;
    *sl = (int)((size - MIN_BLOCK_SIZE) >> 3);
  } else {
    int t = 31 - __builtin_clz((int)size);
    *sl = (int)((size >> (t - SL_LOG2)) & (SL_COUNT - 1));
    *fl = t - FL_SHIFT;
  }
}

// mapping_search: ceiling mapping for search (rounds up)
static void mapping_search(long size, int *fl, int *sl) {
  long rounded = SEARCH_ROUND(size);
  mapping_insert(rounded, fl, sl);
}

static void insert_free_block(long block) {
  int fl, sl;
  long sz = block_size(block);
  mapping_insert(sz, &fl, &sl);

  long head = free_heads[fl * SL_COUNT + sl];
  block_set_next_free(block, head);
  block_set_prev_free(block, 0);
  if (head) block_set_prev_free(head, block);
  free_heads[fl * SL_COUNT + sl] = block;

  fl_bitmap = fl_bitmap | (1 << fl);
  sl_bitmap[fl] = sl_bitmap[fl] | (1 << sl);
}

static void remove_free_block(long block) {
  int fl, sl;
  long sz = block_size(block);
  mapping_insert(sz, &fl, &sl);

  long nf = block_get_next_free(block);
  long pf = block_get_prev_free(block);
  if (nf && block_get_prev_free(nf) != block) {
    puts("Corrupted heap: free list broken (next->prev != cur)");
    __wasm(void, (), op 0x00);
  }
  if (pf && block_get_next_free(pf) != block) {
    puts("Corrupted heap: free list broken (prev->next != cur)");
    __wasm(void, (), op 0x00);
  }
  if (nf) block_set_prev_free(nf, pf);
  if (pf) block_set_next_free(pf, nf);
  else {
    free_heads[fl * SL_COUNT + sl] = nf;
    if (!nf) {
      sl_bitmap[fl] = sl_bitmap[fl] & ~(1 << sl);
      if (!sl_bitmap[fl])
        fl_bitmap = fl_bitmap & ~(1 << fl);
    }
  }
}

static long find_suitable_block(int *fl, int *sl) {
  // Search current SL bitmap from sl upward
  long sl_map = sl_bitmap[*fl] & (~0L << *sl);
  if (!sl_map) {
    // Search FL bitmap from fl+1 upward
    long fl_map = fl_bitmap & (~0L << (*fl + 1));
    if (!fl_map) return 0;
    *fl = __builtin_ctz((int)fl_map);
    sl_map = sl_bitmap[*fl];
  }
  *sl = __builtin_ctz((int)sl_map);
  return free_heads[*fl * SL_COUNT + *sl];
}

static long merge_prev(long block) {
  if (block_prev_is_free(block)) {
    long prev = block_prev_phys(block);
    remove_free_block(prev);
    long new_size = block_size(prev) + block_size(block);
    *(long *)prev = (*(long *)prev & FLAG_BITS) | new_size;
    // Update prev_phys of next physical block
    long next = block_next_phys(prev);
    if (next < pool_end)
      *(long *)(next + 4) = prev;
    if (block == last_block)
      last_block = prev;
    block = prev;
  }
  return block;
}

static long merge_next(long block) {
  long next = block_next_phys(block);
  if (next < pool_end && block_is_free(next)) {
    remove_free_block(next);
    long new_size = block_size(block) + block_size(next);
    *(long *)block = (*(long *)block & FLAG_BITS) | new_size;
    // Update prev_phys of block after next
    long after = block_next_phys(block);
    if (after < pool_end)
      *(long *)(after + 4) = block;
    if (next == last_block)
      last_block = block;
  }
  return block;
}

static void split_block(long block, long needed) {
  long remainder_size = block_size(block) - needed;
  if (remainder_size >= MIN_BLOCK_SIZE) {
    // Resize current block
    *(long *)block = (*(long *)block & FLAG_BITS) | needed;
    // Create remainder block
    long rem = block + needed;
    *(long *)rem = remainder_size | FREE_BIT;
    *(long *)(rem + 4) = block;
    // Update next block's prev_phys
    long next = rem + remainder_size;
    if (next < pool_end)
      *(long *)(next + 4) = rem;
    if (block == last_block)
      last_block = rem;
    insert_free_block(rem);
    // Set PREV_FREE on successor
    next = block_next_phys(block);
    if (next < pool_end)
      *(long *)next = *(long *)next | PREV_FREE_BIT;
  }
}

static void block_mark_used(long block) {
  *(long *)block = *(long *)block & ~FREE_BIT;
  // Clear PREV_FREE on next physical block
  long next = block_next_phys(block);
  if (next < pool_end)
    *(long *)next = *(long *)next & ~PREV_FREE_BIT;
}

static void block_mark_free(long block) {
  *(long *)block = *(long *)block | FREE_BIT;
  // Set PREV_FREE on next physical block
  long next = block_next_phys(block);
  if (next < pool_end)
    *(long *)next = *(long *)next | PREV_FREE_BIT;
}

static void init_pool(void) {
  pool_start = __builtin(heap_base);
  // Align pool_start to BLOCK_ALIGN
  pool_start = (pool_start + BLOCK_ALIGN - 1) & ~(BLOCK_ALIGN - 1);
  pool_end = pool_start;
  last_block = 0;
  fl_bitmap = 0;
  int i = 0;
  while (i < FL_COUNT) { sl_bitmap[i] = 0; i = i + 1; }
  i = 0;
  while (i < FL_COUNT * SL_COUNT) { free_heads[i] = 0; i = i + 1; }
  initialized = 1;
}

static int grow_pool(long needed) {
  // needed includes BLOCK_OVERHEAD
  long new_end = pool_end + needed;
  // Align to page boundary for wasm memory.grow
  long pages = (new_end + 65535) / 65536;
  if (pages > __builtin(memory_size)) {
    long grow = pages - __builtin(memory_size);
    if (__builtin(memory_grow, grow) == (size_t)-1)
      return 0;
  }
  // Create a new block at pool_end
  long block = pool_end;
  long block_sz = new_end - pool_end;
  // Round up so mapping_search can find this block
  block_sz = SEARCH_ROUND(block_sz);
  // Round up to alignment
  block_sz = (block_sz + BLOCK_ALIGN - 1) & ~(BLOCK_ALIGN - 1);
  new_end = pool_end + block_sz;
  // Re-check pages after rounding
  pages = (new_end + 65535) / 65536;
  if (pages > __builtin(memory_size)) {
    long grow = pages - __builtin(memory_size);
    if (__builtin(memory_grow, grow) == (size_t)-1)
      return 0;
  }

  *(long *)block = block_sz | FREE_BIT;
  *(long *)(block + 4) = last_block;
  pool_end = new_end;

  // If last block is free, merge
  if (last_block && block_is_free(last_block)) {
    // Set prev_free bit so merge_prev works
    *(long *)block = *(long *)block | PREV_FREE_BIT;
    last_block = block;
    block = merge_prev(block);
  } else {
    last_block = block;
  }

  insert_free_block(block);
  return 1;
}

static long adjust_request(long size) {
  // Add overhead and ensure minimum size
  long adjusted = size + BLOCK_OVERHEAD;
  if (adjusted < MIN_BLOCK_SIZE) adjusted = MIN_BLOCK_SIZE;
  // Align up
  adjusted = (adjusted + BLOCK_ALIGN - 1) & ~(BLOCK_ALIGN - 1);
  return adjusted;
}

void *malloc(size_t size) {
  if (size == 0) return (void *)0;
  if (size > 0x40000000L) return (void *)0;

  if (!initialized) init_pool();

  long adjusted = adjust_request((long)size);

  int fl, sl;
  mapping_search(adjusted, &fl, &sl);
  if (fl >= FL_COUNT) {
    // Too large even for search
    if (!grow_pool(adjusted)) return (void *)0;
    mapping_search(adjusted, &fl, &sl);
  }

  long block = find_suitable_block(&fl, &sl);
  if (!block) {
    if (!grow_pool(adjusted)) return (void *)0;
    mapping_search(adjusted, &fl, &sl);
    block = find_suitable_block(&fl, &sl);
    if (!block) return (void *)0;
  }

  remove_free_block(block);
  split_block(block, adjusted);
  block_mark_used(block);

  return (void *)block_payload(block);
}

void free(void *ptr) {
  if (!ptr) return;

  long block = payload_to_block((long)ptr);

  // Bounds check
  if (block < pool_start || block >= pool_end) {
    puts("free: double free detected");
    __wasm(void, (), op 0x00);
  }
  // Double-free detection: block must not already be free
  if (block_is_free(block)) {
    puts("free: double free detected");
    __wasm(void, (), op 0x00);
  }

  block_mark_free(block);
  block = merge_prev(block);
  block = merge_next(block);
  insert_free_block(block);
}

void *calloc(size_t count, size_t size) {
  if (size != 0 && count > 0x40000000L / size) return (void *)0;
  size_t total = count * size;
  void *p = malloc(total);
  if (p) __builtin(memory_fill, p, 0, total);
  return p;
}

void *realloc(void *ptr, size_t new_size) {
  if (!ptr) return malloc(new_size);
  if (new_size == 0) { free(ptr); return (void *)0; }
  // Reject sizes malloc itself would reject; also guards adjust_request below
  // from overflowing a huge request down to MIN_BLOCK_SIZE.
  if (new_size > 0x40000000L) return (void *)0;

  long block = payload_to_block((long)ptr);
  long old_payload = block_size(block) - BLOCK_OVERHEAD;

  // If new size fits in current block, keep it
  if (new_size <= (size_t)old_payload) return ptr;

  // Grow in place by absorbing the next physical block when it is free and the
  // combined size satisfies the request; avoids the malloc+copy+free round-trip.
  // Mirrors the reference TLSF tlsf_realloc.
  long adjusted = adjust_request((long)new_size);
  long next = block_next_phys(block);
  if (next < pool_end && block_is_free(next) &&
      block_size(block) + block_size(next) >= adjusted) {
    merge_next(block);
    split_block(block, adjusted);
    block_mark_used(block);
    return ptr;
  }

  // Allocate new, copy, free old
  void *new_ptr = malloc(new_size);
  if (!new_ptr) return (void *)0;
  __builtin(memory_copy, new_ptr, ptr, old_payload);
  free(ptr);
  return new_ptr;
}

void *aligned_alloc(size_t alignment, size_t size) {
  // C11 7.22.3.1: alignment must be a supported alignment, size a multiple of alignment
  if (alignment == 0 || (alignment & (alignment - 1)) != 0) return (void *)0;
  if (size % alignment != 0) return (void *)0;
  // TLSF malloc returns 8-byte aligned memory (BLOCK_ALIGN == 8).
  // Alignments up to 8 are satisfied directly. Larger extended alignments are
  // not supported (the compiler rejects _Alignas > max_align_t == 8).
  if (alignment > 8) return (void *)0;
  return malloc(size);
}

void __inspect_heap(struct __heap_info *info) {
  if (!initialized) init_pool();
  info->heap_start = pool_start;
  info->heap_end = pool_end;
  info->total_bytes = pool_end - pool_start;
  long fb = 0;
  long fby = 0;
  long lf = 0;
  int f = 0;
  while (f < FL_COUNT) {
    int s = 0;
    while (s < SL_COUNT) {
      long b = free_heads[f * SL_COUNT + s];
      while (b) {
        long sz = block_size(b) - BLOCK_OVERHEAD;
        fb = fb + 1;
        fby = fby + sz;
        if (sz > lf) lf = sz;
        b = block_get_next_free(b);
      }
      s = s + 1;
    }
    f = f + 1;
  }
  info->free_blocks = fb;
  info->free_bytes = fby;
  info->largest_free = lf;
}
  `,
  "__math.c": `
#include <math.h>

// Unary f64 (double)
double fabs(double x) { return __wasm(double, (x), op 0x99); }
double ceil(double x) { return __wasm(double, (x), op 0x9B); }
double floor(double x) { return __wasm(double, (x), op 0x9C); }
double trunc(double x) { return __wasm(double, (x), op 0x9D); }
double nearbyint(double x) { return __wasm(double, (x), op 0x9E); }
double rint(double x) { return __wasm(double, (x), op 0x9E); }
double sqrt(double x) { return __wasm(double, (x), op 0x9F); }

// Unary f32 (float)
float fabsf(float x) { return __wasm(float, (x), op 0x8B); }
float ceilf(float x) { return __wasm(float, (x), op 0x8D); }
float floorf(float x) { return __wasm(float, (x), op 0x8E); }
float truncf(float x) { return __wasm(float, (x), op 0x8F); }
float nearbyintf(float x) { return __wasm(float, (x), op 0x90); }
float rintf(float x) { return __wasm(float, (x), op 0x90); }
float sqrtf(float x) { return __wasm(float, (x), op 0x91); }

// Binary f64 (double)
// fmin/fmax: C11 F.10.9 treats one NaN argument as missing data (return the
// other argument); the raw wasm min/max opcodes would propagate the NaN, so
// they only handle the no-NaN path (where their -0/+0 ordering is correct).
double fmin(double x, double y) {
  if (x != x) return y;
  if (y != y) return x;
  return __wasm(double, (x, y), op 0xA4);
}
double fmax(double x, double y) {
  if (x != x) return y;
  if (y != y) return x;
  return __wasm(double, (x, y), op 0xA5);
}
double copysign(double x, double y) { return __wasm(double, (x, y), op 0xA6); }

// Binary f32 (float)
float fminf(float x, float y) {
  if (x != x) return y;
  if (y != y) return x;
  return __wasm(float, (x, y), op 0x96);
}
float fmaxf(float x, float y) {
  if (x != x) return y;
  if (y != y) return x;
  return __wasm(float, (x, y), op 0x97);
}
float copysignf(float x, float y) { return __wasm(float, (x, y), op 0x98); }

// Float wrappers for host-imported functions
float sinf(float x) { return (float)sin((double)x); }
float cosf(float x) { return (float)cos((double)x); }
float tanf(float x) { return (float)tan((double)x); }
float asinf(float x) { return (float)asin((double)x); }
float acosf(float x) { return (float)acos((double)x); }
float atanf(float x) { return (float)atan((double)x); }
float atan2f(float y, float x) { return (float)atan2((double)y, (double)x); }
float sinhf(float x) { return (float)sinh((double)x); }
float coshf(float x) { return (float)cosh((double)x); }
float tanhf(float x) { return (float)tanh((double)x); }
float asinhf(float x) { return (float)asinh((double)x); }
float acoshf(float x) { return (float)acosh((double)x); }
float atanhf(float x) { return (float)atanh((double)x); }
float expf(float x) { return (float)exp((double)x); }
double exp2(double x) { return exp(x * 0.6931471805599453); }
float exp2f(float x) { return (float)exp2((double)x); }
float expm1f(float x) { return (float)expm1((double)x); }
float logf(float x) { return (float)log((double)x); }
float log2f(float x) { return (float)log2((double)x); }
float log10f(float x) { return (float)log10((double)x); }
float log1pf(float x) { return (float)log1p((double)x); }
float powf(float x, float y) { return (float)pow((double)x, (double)y); }
float cbrtf(float x) { return (float)cbrt((double)x); }
float hypotf(float x, float y) { return (float)hypot((double)x, (double)y); }
float fmodf(float x, float y) { return (float)fmod((double)x, (double)y); }

// round: ties away from zero
double round(double x) {
  double t = trunc(x);
  if (fabs(x - t) >= 0.5) return t + copysign(1.0, x);
  return t;
}
float roundf(float x) {
  float t = truncf(x);
  if (fabsf(x - t) >= 0.5f) return t + copysignf(1.0f, x);
  return t;
}

double fdim(double x, double y) { return x > y ? x - y : 0.0; }
float fdimf(float x, float y) { return x > y ? x - y : 0.0f; }

long lround(double x) { return (long)round(x); }
long lrint(double x) { return (long)rint(x); }
long lroundf(float x) { return (long)roundf(x); }
long lrintf(float x) { return (long)rintf(x); }

// nextafter: return next representable value from x toward y
// IEEE 754 doubles have the property that consecutive values have
// consecutive bit patterns (within the same sign), so +-1 on the
// reinterpreted integer gives the adjacent double.
double nextafter(double x, double y) {
  if (x != x || y != y) return x + y;
  if (x == y) return y;
  long long bits = __wasm(long long, (x), op 0xBD);
  if (x == 0.0) {
    bits = 1LL;
    double tiny = __wasm(double, (bits), op 0xBF);
    return copysign(tiny, y);
  }
  if ((x < y) == (x > 0.0)) bits++;
  else bits--;
  return __wasm(double, (bits), op 0xBF);
}
float nextafterf(float x, float y) {
  if (x != x || y != y) return x + y;
  if (x == y) return y;
  int bits = __wasm(int, (x), op 0xBC);
  if (x == 0.0f) {
    bits = 1;
    float tiny = __wasm(float, (bits), op 0xBE);
    return copysignf(tiny, y);
  }
  if ((x < y) == (x > 0.0f)) bits++;
  else bits--;
  return __wasm(float, (bits), op 0xBE);
}

// frexp: split x into normalized fraction [0.5, 1) and exponent
double frexp(double x, int *exp) {
  long long bits = __wasm(long long, (x), op 0xBD);
  long long emask = (long long)0x7FF << 52;
  int e = (int)((bits >> 52) & 0x7FF);
  if (e == 0) {
    if (x == 0.0) { *exp = 0; return x; }
    // Subnormal: multiply by 2^52 to normalize
    x = x * 4503599627370496.0;
    bits = __wasm(long long, (x), op 0xBD);
    e = (int)((bits >> 52) & 0x7FF);
    e = e - 52;
  } else if (e == 0x7FF) {
    *exp = 0;
    return x;
  }
  *exp = e - 1022;
  bits = (bits & ~emask) | ((long long)0x3FE << 52);
  return __wasm(double, (bits), op 0xBF);
}

// ldexp: multiply x by 2^n
// Uses repeated scaling to handle the full range of n without
// overflowing intermediate exponent calculations.
// Special cases (zero, inf, NaN) are handled naturally by multiplication.
double ldexp(double x, int n) {
  if (n > 1023) {
    x *= 8.98846567431158e307;  // 2^1023
    n -= 1023;
    if (n > 1023) {
      x *= 8.98846567431158e307;
      n -= 1023;
      if (n > 1023) n = 1023;
    }
  } else if (n < -1022) {
    x *= 2.2250738585072014e-308;  // 2^-1022
    n += 1022;
    if (n < -1022) {
      x *= 2.2250738585072014e-308;
      n += 1022;
      if (n < -1022) n = -1022;
    }
  }
  long long scale_bits = (long long)(n + 1023) << 52;
  double scale = __wasm(double, (scale_bits), op 0xBF);
  return x * scale;
}

float ldexpf(float x, int n) { return (float)ldexp((double)x, n); }

// ilogb: extract unbiased exponent as int
int ilogb(double x) {
  long long bits = __wasm(long long, (x), op 0xBD);
  int e = (int)((bits >> 52) & 0x7FF);
  if (e == 0) {
    if (x == 0.0) return -2147483647 - 1;
    x = fabs(x) * 4503599627370496.0;
    bits = __wasm(long long, (x), op 0xBD);
    e = (int)((bits >> 52) & 0x7FF);
    return e - 1023 - 52;
  }
  if (e == 0x7FF) return 2147483647;
  return e - 1023;
}

// logb: extract exponent as double
double logb(double x) {
  long long bits = __wasm(long long, (x), op 0xBD);
  int e = (int)((bits >> 52) & 0x7FF);
  if (e == 0) {
    if (x == 0.0) return -1.0 / 0.0;
    x = fabs(x) * 4503599627370496.0;
    bits = __wasm(long long, (x), op 0xBD);
    e = (int)((bits >> 52) & 0x7FF);
    return (double)(e - 1023 - 52);
  }
  if (e == 0x7FF) return x * x;
  return (double)(e - 1023);
}

double modf(double x, double *iptr) {
  /* C99 F.10.3.12: modf(+/-inf) stores +/-inf and returns +/-0; the
     naive x - *iptr would compute inf - inf = NaN. */
  if (__isinfd(x)) {
    *iptr = x;
    return copysign(0.0, x);
  }
  *iptr = trunc(x);
  /* C99 F.10.3.12: the fractional part carries the sign of x, including
     for a zero fraction: modf(-100.0) is (-0.0, -100.0). Plain x - *iptr
     gives +0.0. */
  return copysign(x - *iptr, x);
}
float modff(float x, float *iptr) {
  if (__isinff(x)) {
    *iptr = x;
    return copysignf(0.0f, x);
  }
  *iptr = truncf(x);
  return copysignf(x - *iptr, x);
}

double nan(const char *tag) { (void)tag; return NAN; }
float nanf(const char *tag) { (void)tag; return NAN; }

// IEEE 754 classification via bit inspection. The standard isnan/isinf
// etc. macros need underlying functions; we provide both float and
// double variants.
int __isnand(double x) {
  long long bits = __wasm(long long, (x), op 0xBD);
  long long exp = (bits >> 52) & 0x7FFL;
  long long frac = bits & 0xFFFFFFFFFFFFFL;
  return exp == 0x7FF && frac != 0;
}
int __isinfd(double x) {
  long long bits = __wasm(long long, (x), op 0xBD);
  long long exp = (bits >> 52) & 0x7FFL;
  long long frac = bits & 0xFFFFFFFFFFFFFL;
  return exp == 0x7FF && frac == 0;
}
int __isfinited(double x) {
  long long bits = __wasm(long long, (x), op 0xBD);
  long long exp = (bits >> 52) & 0x7FFL;
  return exp != 0x7FF;
}
int __isnormald(double x) {
  long long bits = __wasm(long long, (x), op 0xBD);
  long long exp = (bits >> 52) & 0x7FFL;
  return exp != 0 && exp != 0x7FF;
}
int __signbitd(double x) {
  long long bits = __wasm(long long, (x), op 0xBD);
  return (int)((bits >> 63) & 1L);
}
int __isnanf(float x) {
  int bits = __wasm(int, (x), op 0xBC);
  int exp = (bits >> 23) & 0xFF;
  int frac = bits & 0x7FFFFF;
  return exp == 0xFF && frac != 0;
}
int __isinff(float x) {
  int bits = __wasm(int, (x), op 0xBC);
  int exp = (bits >> 23) & 0xFF;
  int frac = bits & 0x7FFFFF;
  return exp == 0xFF && frac == 0;
}
int __isfinitef(float x) {
  int bits = __wasm(int, (x), op 0xBC);
  int exp = (bits >> 23) & 0xFF;
  return exp != 0xFF;
}
int __isnormalf(float x) {
  int bits = __wasm(int, (x), op 0xBC);
  int exp = (bits >> 23) & 0xFF;
  return exp != 0 && exp != 0xFF;
}
int __signbitf(float x) {
  int bits = __wasm(int, (x), op 0xBC);
  return (bits >> 31) & 1;
}

float frexpf(float x, int *exp) {
  double d = (double)x;
  double r = frexp(d, exp);
  return (float)r;
}

float erff(float x)    { return (float)erf((double)x); }
float erfcf(float x)   { return (float)erfc((double)x); }
float tgammaf(float x) { return (float)tgamma((double)x); }
float lgammaf(float x) { return (float)lgamma((double)x); }
  `,
  "__stdio.c": `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <spawn.h>      // popen() spawns /bin/sh
#include <sys/wait.h>   // pclose() reaps the child

static char __stdin_buf[BUFSIZ];
static char __stdout_buf[BUFSIZ];

FILE __stdin_file  = {0, __F_READ  | __F_STATIC, _IOLBF, __stdin_buf,  BUFSIZ, 0, 0, EOF};
FILE __stdout_file = {1, __F_WRITE | __F_STATIC, _IOLBF, __stdout_buf, BUFSIZ, 0, 0, EOF};
FILE __stderr_file = {2, __F_WRITE | __F_STATIC, _IONBF, 0, 0, 0, 0, EOF};

static FILE *__open_files[64];
static int __num_open_files;

static int __flush_buf(FILE *stream) {
  int pos = 0;
  while (pos < stream->buf_pos) {
    long w = write(stream->fd, stream->buf + pos, stream->buf_pos - pos);
    if (w <= 0) {
      /* Preserve unwritten data at front of buffer */
      int remaining = stream->buf_pos - pos;
      memmove(stream->buf, stream->buf + pos, remaining);
      stream->buf_pos = remaining;
      stream->flags |= __F_ERR;
      return -1;
    }
    pos += w;
  }
  stream->buf_pos = 0;
  return 0;
}

int fflush(FILE *stream) {
  if (!stream) {
    fflush(stdout);
    fflush(stderr);
    for (int i = 0; i < __num_open_files; i++) {
      if (__open_files[i]) fflush(__open_files[i]);
    }
    return 0;
  }
  if ((stream->flags & __F_WRITE) && !(stream->flags & __F_RBUF) && stream->buf_pos > 0) {
    return __flush_buf(stream);
  }
  return 0;
}

size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream) {
  if (!(stream->flags & __F_WRITE)) {
    /* C11 7.21: wrong-direction access fails with the error indicator
       set — it must not kill the process. */
    stream->flags |= __F_ERR;
    errno = EBADF;
    return 0;
  }
  if (size == 0 || nmemb == 0) return 0;
  size_t total = size * nmemb;
  const char *src = (const char *)ptr;

  if (stream->buf_mode == _IONBF || !stream->buf) {
    long w = write(stream->fd, src, total);
    if (w < 0) { stream->flags |= __F_ERR; return 0; }
    return w / size;
  }

  if (stream->buf_mode == _IOLBF) {
    for (size_t i = 0; i < total; i++) {
      stream->buf[stream->buf_pos++] = src[i];
      if (src[i] == '\\n' || stream->buf_pos >= stream->buf_size) {
        if (__flush_buf(stream) < 0) return i / size;
      }
    }
    return nmemb;
  }

  /* _IOFBF */
  for (size_t i = 0; i < total; i++) {
    stream->buf[stream->buf_pos++] = src[i];
    if (stream->buf_pos >= stream->buf_size) {
      if (__flush_buf(stream) < 0) return i / size;
    }
  }
  return nmemb;
}

size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream) {
  if (!(stream->flags & __F_READ)) {
    stream->flags |= __F_ERR;
    errno = EBADF;
    return 0;
  }
  if (size == 0 || nmemb == 0) return 0;
  size_t total = size * nmemb;
  char *dst = (char *)ptr;
  size_t got = 0;
  if (stream->ungetc_char != EOF && got < total) {
    dst[got++] = (unsigned char)stream->ungetc_char;
    stream->ungetc_char = EOF;
  }
  while (got < total) {
    if (stream->buf_pos < stream->buf_len) {
      size_t avail = stream->buf_len - stream->buf_pos;
      size_t want = total - got;
      size_t n = avail < want ? avail : want;
      memcpy(dst + got, stream->buf + stream->buf_pos, n);
      stream->buf_pos += n;
      got += n;
    } else {
      /* C11 7.21.3p3: flush all line-buffered output streams when input
         is requested on an unbuffered or line-buffered stream */
      if (stream->buf_mode != _IOFBF) fflush(0);
      if (!stream->buf || stream->buf_size == 0) {
        long r = read(stream->fd, dst + got, total - got);
        if (r <= 0) {
          if (r == 0) stream->flags |= __F_EOF;
          else stream->flags |= __F_ERR;
          break;
        }
        got += r;
      } else {
        long r = read(stream->fd, stream->buf, stream->buf_size);
        if (r <= 0) {
          if (r == 0) stream->flags |= __F_EOF;
          else stream->flags |= __F_ERR;
          break;
        }
        stream->buf_len = r;
        stream->buf_pos = 0;
        stream->flags |= __F_RBUF;
      }
    }
  }
  return got / size;
}

int fgetc(FILE *stream) {
  unsigned char c;
  size_t n = fread(&c, 1, 1, stream);
  if (n == 0) return EOF;
  return c;
}

int ungetc(int c, FILE *stream) {
  if (c == EOF) return EOF;
  stream->ungetc_char = (unsigned char)c;
  stream->flags &= ~__F_EOF;
  return (unsigned char)c;
}

char *fgets(char *s, int n, FILE *stream) {
  if (n <= 0) return 0;
  int i = 0;
  while (i < n - 1) {
    int c = fgetc(stream);
    if (c == EOF) break;
    s[i++] = c;
    if (c == '\\n') break;
  }
  if (i == 0) return 0;
  s[i] = '\\0';
  return s;
}

int fputc(int c, FILE *stream) {
  unsigned char ch = c;
  size_t n = fwrite(&ch, 1, 1, stream);
  if (n == 0) return EOF;
  return ch;
}

int fputs(const char *s, FILE *stream) {
  size_t len = strlen(s);
  size_t n = fwrite(s, 1, len, stream);
  if (n < len) return EOF;
  return 0;
}

int vfprintf(FILE *stream, const char *fmt, va_list ap) {
  va_list ap2;
  va_copy(ap2, ap);
  int len = vsnprintf(0, 0, fmt, ap);
  char stackbuf[256];
  char *buf = stackbuf;
  if (len + 1 > 256) {
    buf = (char *)malloc(len + 1);
  }
  vsnprintf(buf, len + 1, fmt, ap2);
  va_end(ap2);
  fwrite(buf, 1, len, stream);
  if (buf != stackbuf) free(buf);
  return len;
}

int fprintf(FILE *stream, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vfprintf(stream, fmt, ap);
  va_end(ap);
  return r;
}

/* POSIX dprintf/vdprintf: formatted output written unbuffered straight to a
   file descriptor (no FILE, no stdio buffering). Mirrors vfprintf but uses
   write() as the sink. */
int vdprintf(int fd, const char *fmt, va_list ap) {
  va_list ap2;
  va_copy(ap2, ap);
  int len = vsnprintf(0, 0, fmt, ap);
  char stackbuf[256];
  char *buf = stackbuf;
  if (len + 1 > 256) {
    buf = (char *)malloc(len + 1);
  }
  vsnprintf(buf, len + 1, fmt, ap2);
  va_end(ap2);
  write(fd, buf, len);
  if (buf != stackbuf) free(buf);
  return len;
}

int dprintf(int fd, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vdprintf(fd, fmt, ap);
  va_end(ap);
  return r;
}

int vprintf(const char *fmt, va_list ap) {
  return vfprintf(stdout, fmt, ap);
}

int printf(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vfprintf(stdout, fmt, ap);
  va_end(ap);
  return r;
}

int putchar(int c) {
  return fputc(c, stdout);
}

int puts(const char *s) {
  fputs(s, stdout);
  fputc('\\n', stdout);
  return 0;
}

FILE *fopen(const char *path, const char *mode) {
  int flags = 0;
  int fflags = 0;
  if (mode[0] == 'r') {
    if (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) {
      flags = O_RDWR;
      fflags = __F_READ | __F_WRITE;
    } else {
      flags = O_RDONLY;
      fflags = __F_READ;
    }
  } else if (mode[0] == 'w') {
    if (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) {
      flags = O_RDWR | O_CREAT | O_TRUNC;
      fflags = __F_READ | __F_WRITE;
    } else {
      flags = O_WRONLY | O_CREAT | O_TRUNC;
      fflags = __F_WRITE;
    }
  } else if (mode[0] == 'a') {
    if (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) {
      flags = O_RDWR | O_CREAT | O_APPEND;
      fflags = __F_READ | __F_WRITE | __F_APPEND;
    } else {
      flags = O_WRONLY | O_CREAT | O_APPEND;
      fflags = __F_WRITE | __F_APPEND;
    }
  } else {
    return 0;
  }
  int fd = open(path, flags, 0666);
  if (fd < 0) return 0;

  FILE *f = (FILE *)malloc(sizeof(FILE));
  char *buf = (char *)malloc(BUFSIZ);
  f->fd = fd;
  f->flags = fflags | __F_OWNBUF;
  f->buf_mode = _IOFBF;
  f->buf = buf;
  f->buf_size = BUFSIZ;
  f->buf_pos = 0;
  f->buf_len = 0;
  f->ungetc_char = EOF;

  if (__num_open_files < 64) {
    __open_files[__num_open_files++] = f;
  }
  return f;
}

FILE *fdopen(int fd, const char *mode) {
  int fflags = 0;
  if (mode[0] == 'r') {
    fflags = (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) ? (__F_READ | __F_WRITE) : __F_READ;
  } else if (mode[0] == 'w') {
    fflags = (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) ? (__F_READ | __F_WRITE) : __F_WRITE;
  } else if (mode[0] == 'a') {
    fflags = (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) ? (__F_READ | __F_WRITE | __F_APPEND) : (__F_WRITE | __F_APPEND);
  } else {
    return 0;
  }
  FILE *f = (FILE *)malloc(sizeof(FILE));
  char *buf = (char *)malloc(BUFSIZ);
  f->fd = fd;
  f->flags = fflags | __F_OWNBUF;
  f->buf_mode = _IOFBF;
  f->buf = buf;
  f->buf_size = BUFSIZ;
  f->buf_pos = 0;
  f->buf_len = 0;
  f->ungetc_char = EOF;
  if (__num_open_files < 64) {
    __open_files[__num_open_files++] = f;
  }
  return f;
}

int fileno(FILE *stream) { return stream ? stream->fd : -1; }

int fclose(FILE *stream) {
  fflush(stream);
  int r = close(stream->fd);
  if (stream->buf && (stream->flags & __F_OWNBUF)) free(stream->buf);
  for (int i = 0; i < __num_open_files; i++) {
    if (__open_files[i] == stream) {
      __open_files[i] = __open_files[--__num_open_files];
      break;
    }
  }
  if (stream->flags & __F_STATIC) {
    /* stdin/stdout/stderr are static objects: mark the stream closed
       (drop the read/write bits so the exit-path fflush and any later
       I/O leave the dead fd alone) instead of freeing it. */
    stream->flags = __F_STATIC;
    stream->buf = 0;
    stream->buf_size = 0;
    stream->buf_pos = 0;
    stream->buf_len = 0;
    stream->ungetc_char = EOF;
    return r;
  }
  free(stream);
  return r;
}

static int __tmpfile_counter;
__import long long __time_now(void);

FILE *tmpfile(void) {
  /* Generate a unique path, open it, and unlink immediately: the open
     fd keeps working (POSIX) while the name disappears. The time()
     component avoids collisions between concurrent processes. */
  for (int tries = 0; tries < 100; tries++) {
    char name[80];
    snprintf(name, sizeof name, "/tmp/__wasm_tmpfile_%ld_%d",
             (long)__time_now(), __tmpfile_counter++);
    FILE *f = fopen(name, "w+b");
    if (f) {
      remove(name);
      return f;
    }
  }
  return 0;
}

int fseek(FILE *stream, long offset, int whence) {
  fflush(stream);
  if (whence == SEEK_CUR) {
    /* The fd position sits at the end of any read-ahead; the stream's
       logical position is buf_len - buf_pos bytes (plus a pending
       ungetc) behind it. Relative seeks are relative to the logical
       position. */
    if (stream->flags & __F_RBUF) {
      offset -= (long)(stream->buf_len - stream->buf_pos);
    }
    if (stream->ungetc_char != EOF) offset--;
  }
  stream->buf_pos = 0;
  stream->buf_len = 0;
  stream->ungetc_char = EOF;
  long r = lseek(stream->fd, offset, whence);
  if (r < 0) return -1;
  stream->flags &= ~(__F_EOF | __F_RBUF);
  return 0;
}

long ftell(FILE *stream) {
  long pos = lseek(stream->fd, 0, SEEK_CUR);
  if (pos < 0) return -1;
  if (stream->flags & __F_RBUF) {
    /* Buffer holds read-ahead: logical position is behind the fd. */
    pos -= (stream->buf_len - stream->buf_pos);
  } else if (stream->flags & __F_WRITE) {
    /* Buffer holds unflushed output: logical position is ahead of
       the fd. On update streams (r+/w+/a+) both flags are set, so
       __F_RBUF must decide which way buf_pos counts. */
    pos += stream->buf_pos;
  }
  if ((stream->flags & __F_READ) && stream->ungetc_char != EOF) pos--;
  return pos;
}

void rewind(FILE *stream) {
  fseek(stream, 0, SEEK_SET);
  stream->flags &= ~__F_ERR;
}

/* fgetpos/fsetpos carry a full 64-bit off_t (unlike ftell/fseek's long), so
   they work on files larger than 2 GiB. The position is computed at off_t
   width by mirroring ftell's buffer-adjustment logic, and restored with a
   64-bit lseek (mirroring fseek's SEEK_SET path). */
int fgetpos(FILE *stream, fpos_t *pos) {
  off_t p = lseek(stream->fd, 0, SEEK_CUR);
  if (p < 0) return -1;
  if (stream->flags & __F_RBUF) {
    p -= (stream->buf_len - stream->buf_pos);
  } else if (stream->flags & __F_WRITE) {
    p += stream->buf_pos;
  }
  if ((stream->flags & __F_READ) && stream->ungetc_char != EOF) p--;
  *pos = p;
  return 0;
}

/* fseeko/ftello: the POSIX off_t-wide fseek/ftell (od's dump_skip seeks
   with fseeko — todos/0034). Same buffer discipline as fseek/ftell, at
   64-bit width like fgetpos/fsetpos. */
int fseeko(FILE *stream, off_t offset, int whence) {
  fflush(stream);
  if (whence == SEEK_CUR) {
    if (stream->flags & __F_RBUF) {
      offset -= (off_t)(stream->buf_len - stream->buf_pos);
    }
    if (stream->ungetc_char != EOF) offset--;
  }
  stream->buf_pos = 0;
  stream->buf_len = 0;
  stream->ungetc_char = EOF;
  off_t r = lseek(stream->fd, offset, whence);
  if (r < 0) return -1;
  stream->flags &= ~(__F_EOF | __F_RBUF);
  return 0;
}

off_t ftello(FILE *stream) {
  fpos_t p;
  if (fgetpos(stream, &p) != 0) return -1;
  return (off_t)p;
}

int fsetpos(FILE *stream, const fpos_t *pos) {
  fflush(stream);
  stream->buf_pos = 0;
  stream->buf_len = 0;
  stream->ungetc_char = EOF;
  off_t r = lseek(stream->fd, *pos, SEEK_SET);
  if (r < 0) return -1;
  stream->flags &= ~(__F_EOF | __F_RBUF);
  return 0;
}

int feof(FILE *stream) {
  return (stream->flags & __F_EOF) != 0;
}

int ferror(FILE *stream) {
  return (stream->flags & __F_ERR) != 0;
}

void clearerr(FILE *stream) {
  stream->flags &= ~(__F_EOF | __F_ERR);
}

int setvbuf(FILE *stream, char *buf, int mode, size_t size) {
  fflush(stream);
  stream->buf_mode = mode;
  if (buf) {
    /* Caller-supplied buffer: the library no longer owns the storage,
       so fclose must not free it (and the old owned buffer, if any,
       would leak without an explicit free here). */
    if ((stream->flags & __F_OWNBUF) && stream->buf) free(stream->buf);
    stream->flags &= ~__F_OWNBUF;
    stream->buf = buf;
    stream->buf_size = size;
  }
  stream->buf_pos = 0;
  stream->buf_len = 0;
  return 0;
}

int vsscanf(const char *s, const char *fmt, va_list ap) {
  int consumed;
  int len = strlen(s);
  return __vsscanf_impl(s, len, fmt, &consumed, ap);
}

int sscanf(const char *s, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vsscanf(s, fmt, ap);
  va_end(ap);
  return r;
}

int vfscanf(FILE *stream, const char *fmt, va_list ap) {
  if (!(stream->flags & __F_READ)) {
    stream->flags |= __F_ERR;
    errno = EBADF;
    return EOF;
  }

  /* Handle ungetc char: push it back into the buffer */
  if (stream->ungetc_char != EOF) {
    if (stream->buf_pos > 0) {
      stream->buf_pos--;
      stream->buf[stream->buf_pos] = (char)stream->ungetc_char;
    } else if (stream->buf_len < stream->buf_size) {
      memmove(stream->buf + 1, stream->buf, stream->buf_len);
      stream->buf[0] = (char)stream->ungetc_char;
      stream->buf_len++;
    } else {
      write(2, "vfscanf: buffer full with ungetc pending\\n", 41);
      __wasm(void, (), op 0);
    }
    stream->ungetc_char = EOF;
  }

  /* If buffer empty, try to fill it */
  if (stream->buf_pos >= stream->buf_len) {
    long r = read(stream->fd, stream->buf, stream->buf_size);
    if (r <= 0) {
      if (r == 0) stream->flags |= __F_EOF;
      else stream->flags |= __F_ERR;
      return -1;
    }
    stream->buf_pos = 0;
    stream->buf_len = r;
    stream->flags |= __F_RBUF; /* buffer now holds read-ahead (ftell) */
  }

  /* Shift data to buffer start for accumulation */
  if (stream->buf_pos > 0) {
    memmove(stream->buf, stream->buf + stream->buf_pos, stream->buf_len - stream->buf_pos);
    stream->buf_len -= stream->buf_pos;
    stream->buf_pos = 0;
  }

  /* Loop: try parsing, refill if consumed everything */
  for (;;) {
    va_list ap2;
    va_copy(ap2, ap);
    int consumed;
    int result = __vsscanf_impl(stream->buf, stream->buf_len, fmt, &consumed, ap2);
    va_end(ap2);

    if (consumed < stream->buf_len || (stream->flags & __F_EOF)) {
      /* Done: didn't consume everything, or no more data */
      stream->buf_pos = consumed;
      return result;
    }

    /* Consumed everything — need more data */
    if (stream->buf_len >= stream->buf_size) {
      /* Buffer full, field exceeds buffer size */
      write(2, "vfscanf: field exceeds buffer size\\n", 35);
      __wasm(void, (), op 0);
    }

    long got = read(stream->fd, stream->buf + stream->buf_len,
                    stream->buf_size - stream->buf_len);
    if (got <= 0) {
      if (got == 0) stream->flags |= __F_EOF;
      else stream->flags |= __F_ERR;
      stream->buf_pos = consumed;
      return result;
    }
    stream->buf_len += got;
    stream->flags |= __F_RBUF;
    /* Loop back and retry with more data */
  }
}

int fscanf(FILE *stream, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vfscanf(stream, fmt, ap);
  va_end(ap);
  return r;
}

int vscanf(const char *fmt, va_list ap) {
  return vfscanf(stdin, fmt, ap);
}

int scanf(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vscanf(fmt, ap);
  va_end(ap);
  return r;
}

void setbuf(FILE *stream, char *buf) {
  setvbuf(stream, buf, buf ? _IOFBF : _IONBF, BUFSIZ);
}

void perror(const char *s) {
  if (s && *s)
    fprintf(stderr, "%s: %s\\n", s, strerror(errno));
  else
    fprintf(stderr, "%s\\n", strerror(errno));
}

// Intentionally aborts — vsprintf has no bounds checking and is unsafe.
// Do NOT replace with a working implementation. Use vsnprintf instead.
int vsprintf(char *buf, const char *fmt, va_list ap) {
  fprintf(stderr, "vsprintf() is unsafe and not supported; use vsnprintf() instead\\n");
  abort();
  return 0;
}

int sprintf(char *buf, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vsnprintf(buf, 0x7fffffff, fmt, ap);
  va_end(ap);
  return r;
}

int snprintf(char *buf, size_t size, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vsnprintf(buf, size, fmt, ap);
  va_end(ap);
  return r;
}

// Variadic wrapper around __open_impl (non-variadic host import).
int open(const char *path, int flags, ...) {
  int mode = 0;
  if (flags & 0x40) {
    va_list ap;
    va_start(ap, flags);
    mode = va_arg(ap, int);
    va_end(ap);
  }
  return __open_impl(path, flags, mode);
}

// Intentionally aborts — gets has no bounds checking and is unsafe.
// Do NOT replace with a working implementation. Use fgets instead.
char *gets(char *s) {
  fprintf(stderr, "gets() is unsafe and not supported; use fgets() instead\\n");
  abort();
  return 0;
}

FILE *freopen(const char *path, const char *mode, FILE *stream) {
  if (!stream) return 0;
  fflush(stream);
  close(stream->fd);
  if (!path) return 0;
  int flags = 0;
  int fflags = 0;
  if (mode[0] == 'r') {
    if (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) {
      flags = O_RDWR; fflags = __F_READ | __F_WRITE;
    } else {
      flags = O_RDONLY; fflags = __F_READ;
    }
  } else if (mode[0] == 'w') {
    if (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) {
      flags = O_RDWR | O_CREAT | O_TRUNC; fflags = __F_READ | __F_WRITE;
    } else {
      flags = O_WRONLY | O_CREAT | O_TRUNC; fflags = __F_WRITE;
    }
  } else if (mode[0] == 'a') {
    if (mode[1] == '+' || (mode[1] == 'b' && mode[2] == '+')) {
      flags = O_RDWR | O_CREAT | O_APPEND; fflags = __F_READ | __F_WRITE | __F_APPEND;
    } else {
      flags = O_WRONLY | O_CREAT | O_APPEND; fflags = __F_WRITE | __F_APPEND;
    }
  } else {
    return 0;
  }
  int fd = open(path, flags, 0666);
  if (fd < 0) return 0;
  stream->fd = fd;
  /* Keep the ownership bits: freopen reuses the FILE and its buffer. */
  stream->flags = fflags | (stream->flags & (__F_OWNBUF | __F_STATIC));
  stream->buf_pos = 0;
  stream->buf_len = 0;
  stream->ungetc_char = EOF;
  return stream;
}


char *tmpnam(char *s) { (void)s; return 0; }

/* popen/pclose: spawn /bin/sh -c command with one stdio end wired to a pipe via
   posix_spawn file_actions; pclose reaps the child (FILE->pid map below). Needs
   /bin/sh on the image — seeded by the runtime at mount. */
static struct { FILE *fp; pid_t pid; } __popen_tab[16];

FILE *popen(const char *command, const char *type) {
  if (!command || !type) return 0;
  int reading = (type[0] == 'r');
  int fds[2];
  if (pipe(fds) < 0) return 0;
  posix_spawn_file_actions_t fa;
  posix_spawn_file_actions_init(&fa);
  if (reading) {                                    /* parent reads fds[0] */
    posix_spawn_file_actions_adddup2(&fa, fds[1], 1);    /* child stdout -> pipe */
    posix_spawn_file_actions_addclose(&fa, fds[0]);
  } else {                                          /* parent writes fds[1] */
    posix_spawn_file_actions_adddup2(&fa, fds[0], 0);    /* child stdin <- pipe */
    posix_spawn_file_actions_addclose(&fa, fds[1]);
  }
  char *argv[4];
  argv[0] = "sh"; argv[1] = "-c"; argv[2] = (char *)command; argv[3] = 0;
  pid_t pid;
  int e = posix_spawn(&pid, "/bin/sh", &fa, 0, argv, environ);
  posix_spawn_file_actions_destroy(&fa);
  if (e != 0) { close(fds[0]); close(fds[1]); errno = e; return 0; }
  FILE *fp;
  if (reading) { close(fds[1]); fp = fdopen(fds[0], "r"); }
  else         { close(fds[0]); fp = fdopen(fds[1], "w"); }
  if (!fp) return 0;
  for (int i = 0; i < 16; i++)
    if (!__popen_tab[i].fp) { __popen_tab[i].fp = fp; __popen_tab[i].pid = pid; break; }
  return fp;
}
int pclose(FILE *stream) {
  if (!stream) return -1;
  pid_t pid = -1;
  for (int i = 0; i < 16; i++)
    if (__popen_tab[i].fp == stream) { pid = __popen_tab[i].pid; __popen_tab[i].fp = 0; break; }
  fclose(stream);
  if (pid < 0) return -1;
  int status = 0;
  if (waitpid(pid, &status, 0) < 0) return -1;
  return status;
}
  `,
  "__stdlib.c": `
#include <stdlib.h>
#include <stdio.h>
#include <string.h>     // mkstemp() uses strlen
#include <fcntl.h>      // mkstemp() uses open
#include <unistd.h>     // mktemp() probes with access()
#include <sys/stat.h>   // mkdtemp() uses mkdir
#include <errno.h>
#include <inttypes.h>
#include <__atexit.h>
#include <spawn.h>      // system() spawns /bin/sh
#include <sys/wait.h>   // waitpid()
#include <signal.h>     // abort() raises SIGABRT
__import double __strtod_impl(const char *nptr, char **endptr, const char *bound);

/* mkstemp: POSIX temp-file creation (sed -i and friends). Replaces the
   trailing XXXXXX and opens O_CREAT|O_EXCL. Uniqueness comes from time +
   pid + a counter, like tmpfile() — no anti-tamper story is needed on a
   single-user fs. */
__import long long __time_now(void);
static int __mkstemp_counter;
int mkstemp(char *template_) {
  size_t len = strlen(template_);
  char *x = template_ + len - 6;
  if (len < 6) { errno = EINVAL; return -1; }
  for (int i = 0; i < 6; i++) {
    if (x[i] != 'X') { errno = EINVAL; return -1; }
  }
  for (int tries = 0; tries < 100; tries++) {
    unsigned long v = (unsigned long)__time_now()
        ^ ((unsigned long)getpid() << 8) ^ (unsigned long)__mkstemp_counter++;
    for (int i = 0; i < 6; i++) { x[i] = (char)('a' + v % 26); v /= 26; }
    int fd = open(template_, O_RDWR | O_CREAT | O_EXCL, 0600);
    if (fd >= 0) return fd;
    if (errno != EEXIST) return -1;
  }
  errno = EEXIST;
  return -1;
}

/* mktemp/mkdtemp: same XXXXXX churn as mkstemp (busybox's mktemp applet
   wants all three — todos/0034). mktemp() only NAMES a path (that's why
   POSIX withdrew it — the classic TOCTOU); callers here accept that.
   Failure protocol differs per spec: mktemp returns template_ with
   template_[0] = '\\0', mkdtemp returns NULL. */
static int __mktemp_spin(char *template_, int (*probe)(const char *)) {
  size_t len = strlen(template_);
  char *x = template_ + len - 6;
  if (len < 6) { errno = EINVAL; return -1; }
  for (int i = 0; i < 6; i++) {
    if (x[i] != 'X') { errno = EINVAL; return -1; }
  }
  for (int tries = 0; tries < 100; tries++) {
    unsigned long v = (unsigned long)__time_now()
        ^ ((unsigned long)getpid() << 8) ^ (unsigned long)__mkstemp_counter++;
    for (int i = 0; i < 6; i++) { x[i] = (char)('a' + v % 26); v /= 26; }
    if (probe(template_) == 0) return 0;
    if (errno != EEXIST) return -1;
  }
  errno = EEXIST;
  return -1;
}
static int __mktemp_probe_free(const char *path) {
  if (access(path, F_OK) != 0) return 0;  /* name is free — good */
  errno = EEXIST;
  return -1;
}
static int __mktemp_probe_mkdir(const char *path) {
  return mkdir(path, 0700);
}
char *mktemp(char *template_) {
  if (__mktemp_spin(template_, __mktemp_probe_free) != 0) template_[0] = '\\0';
  return template_;
}
char *mkdtemp(char *template_) {
  if (__mktemp_spin(template_, __mktemp_probe_mkdir) != 0) return 0;
  return template_;
}

int abs(int n) { return n < 0 ? -n : n; }
long labs(long n) { return n < 0 ? -n : n; }

int atoi(const char *nptr) { return (int)strtol(nptr, (char **)0, 10); }
long atol(const char *nptr) { return strtol(nptr, (char **)0, 10); }

static int __digit_value(char c, int base) {
  int v;
  if (c >= '0' && c <= '9') v = c - '0';
  else if (c >= 'a' && c <= 'z') v = c - 'a' + 10;
  else if (c >= 'A' && c <= 'Z') v = c - 'A' + 10;
  else return -1;
  if (v >= base) return -1;
  return v;
}

// Core integer parser: accumulates magnitude as unsigned long long.
// Returns the parsed magnitude. Sets *neg, *any, *overflow, and *endp.
static unsigned long long __strtou_core(
    const char *nptr, const char **endp, int base,
    int *neg, int *any, int *overflow) {
  const char *s = nptr;
  /* C99 7.20.1.4: base must be 0 or 2..36; otherwise EINVAL, value 0,
     endptr = nptr. */
  if (base != 0 && (base < 2 || base > 36)) {
    errno = EINVAL;
    *endp = nptr;
    *neg = 0; *any = 0; *overflow = 0;
    return 0;
  }
  while (*s == ' ' || *s == '\\t' || *s == '\\n' ||
         *s == '\\r' || *s == '\\f' || *s == '\\v')
    s++;
  *neg = 0;
  if (*s == '-') { *neg = 1; s++; }
  else if (*s == '+') { s++; }
  if ((base == 0 || base == 16) && s[0] == '0' && (s[1] == 'x' || s[1] == 'X') &&
      __digit_value(s[2], 16) >= 0) {
    base = 16; s += 2;
  } else if (base == 0 && s[0] == '0') {
    /* Octal — leave the '0' for the digit loop so the any-flag and
       endptr are right for a plain "0" (and "0x" without hex digits). */
    base = 8;
  } else if (base == 0) {
    base = 10;
  }
  unsigned long long result = 0;
  *any = 0;
  *overflow = 0;
  while (1) {
    int d = __digit_value(*s, base);
    if (d < 0) break;
    *any = 1;
    if (result > (18446744073709551615ULL - (unsigned)d) / (unsigned)base) *overflow = 1;
    if (!*overflow) result = result * base + d;
    s++;
  }
  *endp = s;
  return result;
}

unsigned long long strtoull(const char *nptr, char **endptr, int base) {
  const char *end;
  int neg, any, overflow;
  unsigned long long val = __strtou_core(nptr, &end, base, &neg, &any, &overflow);
  if (overflow) { errno = ERANGE; val = 18446744073709551615ULL; }
  else if (neg) { val = -val; }
  if (endptr) *endptr = (char *)(any ? end : nptr);
  return val;
}

long long strtoll(const char *nptr, char **endptr, int base) {
  const char *end;
  int neg, any, overflow;
  unsigned long long val = __strtou_core(nptr, &end, base, &neg, &any, &overflow);
  if (overflow || (!neg && val > 9223372036854775807ULL) ||
      (neg && val > 9223372036854775808ULL)) {
    errno = ERANGE;
    if (endptr) *endptr = (char *)(any ? end : nptr);
    return neg ? (-9223372036854775807LL - 1LL) : 9223372036854775807LL;
  }
  if (endptr) *endptr = (char *)(any ? end : nptr);
  return neg ? -(long long)val : (long long)val;
}

unsigned long strtoul(const char *nptr, char **endptr, int base) {
  const char *end;
  int neg, any, overflow;
  unsigned long long val = __strtou_core(nptr, &end, base, &neg, &any, &overflow);
  if (overflow || val > 4294967295ULL) { errno = ERANGE; val = 4294967295ULL; neg = 0; }
  if (endptr) *endptr = (char *)(any ? end : nptr);
  return neg ? -(unsigned long)val : (unsigned long)val;
}

long strtol(const char *nptr, char **endptr, int base) {
  const char *end;
  int neg, any, overflow;
  unsigned long long val = __strtou_core(nptr, &end, base, &neg, &any, &overflow);
  if (overflow || (!neg && val > 2147483647ULL) ||
      (neg && val > 2147483648ULL)) {
    errno = ERANGE;
    if (endptr) *endptr = (char *)(any ? end : nptr);
    return neg ? (-2147483647L - 1L) : 2147483647L;
  }
  if (endptr) *endptr = (char *)(any ? end : nptr);
  return neg ? -(long)val : (long)val;
}

double strtod(const char *nptr, char **endptr) {
  const char *s = nptr;
  while (*s == ' ' || *s == '\\t' || *s == '\\n' ||
         *s == '\\r' || *s == '\\f' || *s == '\\v')
    s++;
  /* The bound only limits how much memory the host may read — it must
     cover at least the full token (decimal, hex float, inf/infinity,
     nan(...)), and may overshoot: the host's anchored matcher computes
     the exact consumed length itself. Scan the span of plausible
     float-token characters. */
  const char *bound = s;
  if (*bound == '+' || *bound == '-') bound++;
  while ((*bound >= '0' && *bound <= '9') ||
         ((*bound | 32) >= 'a' && (*bound | 32) <= 'z') ||
         *bound == '.' || *bound == '+' || *bound == '-' ||
         *bound == '(' || *bound == ')' || *bound == '_')
    bound++;
  return __strtod_impl(nptr, endptr, bound);
}

__import float __strtof_impl(const char *nptr, char **endptr, const char *bound);

float strtof(const char *nptr, char **endptr) {
  /* Must round ONCE from the decimal to float; going through strtod
     (double) can double-round at the float boundary. */
  const char *t = nptr;
  while (*t == ' ' || *t == '\\t' || *t == '\\n' ||
         *t == '\\r' || *t == '\\f' || *t == '\\v')
    t++;
  const char *bound = t;
  if (*bound == '+' || *bound == '-') bound++;
  while ((*bound >= '0' && *bound <= '9') ||
         ((*bound | 32) >= 'a' && (*bound | 32) <= 'z') ||
         *bound == '.' || *bound == '+' || *bound == '-' ||
         *bound == '(' || *bound == ')' || *bound == '_')
    bound++;
  return __strtof_impl(nptr, endptr, bound);
}

long double strtold(const char *nptr, char **endptr) {
  return (long double)strtod(nptr, endptr);
}

double atof(const char *nptr) {
  return strtod(nptr, (char **)0);
}

long long atoll(const char *nptr) {
  return strtoll(nptr, (char **)0, 10);
}

long long llabs(long long n) { return n < 0 ? -n : n; }

intmax_t imaxabs(intmax_t n) { return n < 0 ? -n : n; }

imaxdiv_t imaxdiv(intmax_t numer, intmax_t denom) {
  imaxdiv_t r;
  r.quot = numer / denom;
  r.rem = numer % denom;
  return r;
}

intmax_t strtoimax(const char *nptr, char **endptr, int base) {
  return (intmax_t)strtoll(nptr, endptr, base);
}

uintmax_t strtoumax(const char *nptr, char **endptr, int base) {
  return (uintmax_t)strtoull(nptr, endptr, base);
}

static unsigned long __rand_next = 1;
int rand(void) {
  __rand_next = __rand_next * 1103515245 + 12345;
  return (__rand_next / 65536) % 32768;
}
void srand(unsigned int seed) { __rand_next = seed; }

void *bsearch(const void *key, const void *base, size_t nmemb,
              size_t size, int (*compar)(const void *, const void *)) {
  size_t lo = 0;
  size_t hi = nmemb;
  while (lo < hi) {
    size_t mid = lo + (hi - lo) / 2;
    const void *p = (const char *)base + mid * size;
    int cmp = compar(key, p);
    if (cmp < 0) hi = mid;
    else if (cmp > 0) lo = mid + 1;
    else return (void *)p;
  }
  return (void *)0;
}

static void __swap(char *a, char *b, size_t size) {
  size_t i = 0;
  while (i < size) {
    char t = a[i];
    a[i] = b[i];
    b[i] = t;
    i++;
  }
}

static void __siftdown(char *base, size_t nmemb, size_t size, size_t i,
                        int (*compar)(const void *, const void *)) {
  while (1) {
    size_t left = 2 * i + 1;
    size_t right = 2 * i + 2;
    size_t largest = i;
    if (left < nmemb &&
        compar(base + left * size, base + largest * size) > 0)
      largest = left;
    if (right < nmemb &&
        compar(base + right * size, base + largest * size) > 0)
      largest = right;
    if (largest == i) break;
    __swap(base + i * size, base + largest * size, size);
    i = largest;
  }
}

void qsort(void *base, size_t nmemb, size_t size,
           int (*compar)(const void *, const void *)) {
  if (nmemb < 2) return;
  char *b = (char *)base;
  // Build max-heap
  size_t i = nmemb / 2;
  while (i > 0) {
    i--;
    __siftdown(b, nmemb, size, i, compar);
  }
  // Extract elements
  size_t end = nmemb;
  while (end > 1) {
    end--;
    __swap(b, b + end * size, size);
    __siftdown(b, end, size, 0, compar);
  }
}

__import void __exit(int status);

void exit(int status) {
  /* C11 7.22.4.4: atexit handlers run first (they may still write to
     streams), then streams are flushed and closed. */
  __run_atexits();
  fflush(0);
  __exit(status);
}
__export exit = exit;


void abort(void) {
  /* C11/POSIX: raise SIGABRT. If a handler is installed it runs (synchronous
     self-delivery); abort then terminates regardless (134 = 128+SIGABRT),
     bypassing atexit handlers. */
  raise(SIGABRT);
  __exit(134);
}

div_t div(int numer, int denom) {
  div_t r;
  r.quot = numer / denom;
  r.rem = numer % denom;
  return r;
}

ldiv_t ldiv(long numer, long denom) {
  ldiv_t r;
  r.quot = numer / denom;
  r.rem = numer % denom;
  return r;
}

lldiv_t lldiv(long long numer, long long denom) {
  lldiv_t r;
  r.quot = numer / denom;
  r.rem = numer % denom;
  return r;
}

/* POSIX environment — environ is the source of truth: getenv() walks it,
   setenv/unsetenv/putenv/clearenv mutate it. Empty by default; the host
   populates it via __set_environ() (see below). The initial block the host
   installs lives in wasm stack memory and is NOT heap-owned, so the first
   mutation deep-copies it to the heap (tracked by __environ_owned). From then
   on every entry is malloc'd, which makes free() uniformly safe across all the
   mutators. (The public extern char **environ is declared in the headers.) */
static char *__environ_empty[] = { 0 };
char **environ = __environ_empty;

/* Forward decls — these string helpers are defined later in this unit. */
size_t strlen(const char *s);
char *strcpy(char *dest, const char *src);
int strncmp(const char *s1, const char *s2, size_t n);
char *strchr(const char *s, int c);
char *strdup(const char *s);

static int __environ_owned = 0;

static int __environ_count(void) {
  int n = 0;
  while (environ[n]) n++;
  return n;
}

static void __environ_take_ownership(void) {
  if (__environ_owned) return;
  int n = __environ_count();
  char **heap = malloc((n + 1) * sizeof(char *));
  for (int i = 0; i < n; i++) heap[i] = strdup(environ[i]);
  heap[n] = 0;
  environ = heap;
  __environ_owned = 1;
}

/* Allocate a heap "name=value" string. */
static char *__environ_entry(const char *name, const char *value) {
  size_t nlen = strlen(name);
  char *e = malloc(nlen + 1 + strlen(value) + 1);
  if (!e) return 0;
  strcpy(e, name);
  e[nlen] = '=';
  strcpy(e + nlen + 1, value);
  return e;
}

/* Index of the variable named "name" (nlen bytes), or -1 if absent. */
static int __environ_find(const char *name, size_t nlen) {
  for (int i = 0; environ[i]; i++) {
    if (strncmp(environ[i], name, nlen) == 0 && environ[i][nlen] == '=')
      return i;
  }
  return -1;
}

char *getenv(const char *name) {
  if (!name || !*name) return 0;
  size_t nlen = strlen(name);
  int i = __environ_find(name, nlen);
  return i < 0 ? 0 : environ[i] + nlen + 1;
}

int setenv(const char *name, const char *value, int overwrite) {
  if (!name || !*name || strchr(name, '=')) { errno = EINVAL; return -1; }
  __environ_take_ownership();
  size_t nlen = strlen(name);
  int i = __environ_find(name, nlen);
  if (i >= 0) {
    if (!overwrite) return 0;
    char *e = __environ_entry(name, value);
    if (!e) { errno = ENOMEM; return -1; }
    free(environ[i]);
    environ[i] = e;
    return 0;
  }
  int n = __environ_count();
  char **ne = realloc(environ, (n + 2) * sizeof(char *));
  if (!ne) { errno = ENOMEM; return -1; }
  environ = ne;
  char *e = __environ_entry(name, value);
  if (!e) { errno = ENOMEM; return -1; }
  environ[n] = e;
  environ[n + 1] = 0;
  return 0;
}

int unsetenv(const char *name) {
  if (!name || !*name || strchr(name, '=')) { errno = EINVAL; return -1; }
  __environ_take_ownership();
  size_t nlen = strlen(name);
  int i;
  while ((i = __environ_find(name, nlen)) >= 0) {
    free(environ[i]);
    int j = i;
    do { environ[j] = environ[j + 1]; j++; } while (environ[j - 1]);
  }
  return 0;
}

/* putenv: POSIX places the caller's string directly into environ. We strdup it
   instead so every environ entry stays uniformly heap-owned (free()-safe in the
   other mutators); the only visible deviation is that later edits to the
   caller's buffer don't propagate — acceptable here. A string lacking '='
   removes that variable. */
int putenv(char *string) {
  char *eq = strchr(string, '=');
  if (!eq) return unsetenv(string);
  __environ_take_ownership();
  size_t nlen = eq - string;
  char *e = strdup(string);
  if (!e) { errno = ENOMEM; return -1; }
  int i = __environ_find(string, nlen);
  if (i >= 0) {
    free(environ[i]);
    environ[i] = e;
    return 0;
  }
  int n = __environ_count();
  char **ne = realloc(environ, (n + 2) * sizeof(char *));
  if (!ne) { free(e); errno = ENOMEM; return -1; }
  environ = ne;
  environ[n] = e;
  environ[n + 1] = 0;
  return 0;
}

int clearenv(void) {
  if (__environ_owned) {
    for (int i = 0; environ[i]; i++) free(environ[i]);
    free(environ);
  }
  char **e = malloc(sizeof(char *));
  if (!e) { errno = ENOMEM; return -1; }
  e[0] = 0;
  environ = e;
  __environ_owned = 1;
  return 0;
}

/* Host boundary. __set_environ installs the initial environment (a
   NULL-terminated char** block built in wasm memory by host.js); __get_environ
   hands the live pointer back so JS can walk it (e.g. to inherit it into a
   spawned child). */
void __set_environ(char **envp) {
  environ = envp ? envp : __environ_empty;
  __environ_owned = 0;
}
char **__get_environ(void) { return environ; }
__export __set_environ = __set_environ;
__export __get_environ = __get_environ;

int system(const char *command) {
  /* posix_spawn("/bin/sh","-c",command) + waitpid. NOTE: needs /bin/sh on the
     image (the dash port) to actually run a command — until then __spawn finds
     no such program and this returns -1. A NULL command asks "is a shell
     available?": yes, once /bin/sh exists. */
  if (!command) return 1;
  char *argv[4];
  argv[0] = "sh"; argv[1] = "-c"; argv[2] = (char *)command; argv[3] = 0;
  pid_t pid;
  int e = posix_spawn(&pid, "/bin/sh", 0, 0, argv, 0);
  if (e != 0) { errno = e; return -1; }
  int status = 0;
  if (waitpid(pid, &status, 0) < 0) return -1;
  return status;
}

/* UTF-8 primitives shared by the non-restartable conversions below and the
   restartable mbrtowc/wcrtomb in __wchar.c — C11 7.22.7 requires both
   families to describe the same execution-environment encoding. They live
   here (always linked) rather than in __wchar.c so plain stdlib users don't
   pull the whole wide-char library into the link. Return values follow
   mbrtowc/wcrtomb: (size_t)-1 invalid sequence, (size_t)-2 incomplete. */
size_t __mbrtowc_utf8(wchar_t *pwc, const char *s, size_t n) {
  if (!s) return 0;
  if (n == 0) return (size_t)-2;
  unsigned char b0 = (unsigned char)s[0];
  if (b0 < 0x80) {
    if (pwc) *pwc = b0;
    return b0 ? 1 : 0;
  }
  unsigned int cp; size_t len;
  if ((b0 & 0xE0) == 0xC0)      { cp = b0 & 0x1F; len = 2; }
  else if ((b0 & 0xF0) == 0xE0) { cp = b0 & 0x0F; len = 3; }
  else if ((b0 & 0xF8) == 0xF0) { cp = b0 & 0x07; len = 4; }
  else return (size_t)-1;
  if (len > n) return (size_t)-2;
  for (size_t i = 1; i < len; i++) {
    unsigned char bi = (unsigned char)s[i];
    if ((bi & 0xC0) != 0x80) return (size_t)-1;
    cp = (cp << 6) | (bi & 0x3F);
  }
  if (pwc) *pwc = (wchar_t)cp;
  return cp ? len : 0;
}

size_t __wcrtomb_utf8(char *s, wchar_t wc) {
  unsigned int c = (unsigned int)wc;
  if (!s) return 1;
  if (c < 0x80) { s[0] = (char)c; return 1; }
  if (c < 0x800) { s[0] = (char)(0xC0 | (c >> 6)); s[1] = (char)(0x80 | (c & 0x3F)); return 2; }
  if (c < 0x10000) { s[0] = (char)(0xE0 | (c >> 12)); s[1] = (char)(0x80 | ((c >> 6) & 0x3F)); s[2] = (char)(0x80 | (c & 0x3F)); return 3; }
  if (c < 0x110000) { s[0] = (char)(0xF0 | (c >> 18)); s[1] = (char)(0x80 | ((c >> 12) & 0x3F)); s[2] = (char)(0x80 | ((c >> 6) & 0x3F)); s[3] = (char)(0x80 | (c & 0x3F)); return 4; }
  return (size_t)-1;
}

/* Non-restartable multibyte conversions (C11 7.22.7), UTF-8 like the
   restartable family (the encoding is stateless — no shift sequences). */
int mblen(const char *s, size_t n) {
  return mbtowc((wchar_t *)0, s, n);
}

int mbtowc(wchar_t *pwc, const char *s, size_t n) {
  if (!s) return 0;
  size_t r = __mbrtowc_utf8(pwc, s, n);
  if (r == (size_t)-1 || r == (size_t)-2) return -1;
  return (int)r;
}

int wctomb(char *s, wchar_t wc) {
  if (!s) return 0;
  size_t r = __wcrtomb_utf8(s, wc);
  return r == (size_t)-1 ? -1 : (int)r;
}

size_t mbstowcs(wchar_t *dest, const char *src, size_t n) {
  size_t out = 0;
  while (!dest || out < n) {
    wchar_t wc = 0;
    int k = mbtowc(&wc, src, MB_CUR_MAX);
    if (k < 0) return (size_t)-1;
    if (dest) dest[out] = wc;
    if (k == 0) return out;  /* null wide char stored, not counted */
    out++;
    src += k;
  }
  return out;
}

size_t wcstombs(char *dest, const wchar_t *src, size_t n) {
  size_t out = 0;
  for (size_t i = 0; ; i++) {
    char tmp[MB_CUR_MAX];
    int k = wctomb(tmp, src[i]);
    if (k < 0) return (size_t)-1;
    if (src[i] == 0) {
      if (dest && out < n) dest[out] = '\\0';
      return out;  /* null byte stored, not counted */
    }
    if (dest && out + (size_t)k > n) return out;  /* no room for a whole char */
    if (dest) for (int j = 0; j < k; j++) dest[out + j] = tmp[j];
    out += k;
  }
}
  `,
  "__string.c": `
#include <stddef.h>
#include <stdlib.h>
#include <errno.h>

void *memcpy(void *dest, const void *src, size_t n) {
  __builtin(memory_copy, dest, src, n);
  return dest;
}

void *memmove(void *dest, const void *src, size_t n) {
  // wasm memory.copy handles overlapping regions correctly
  __builtin(memory_copy, dest, src, n);
  return dest;
}

void *memset(void *s, int c, size_t n) {
  __builtin(memory_fill, s, c, n);
  return s;
}

int memcmp(const void *s1, const void *s2, size_t n) {
  const unsigned char *a = (const unsigned char *)s1;
  const unsigned char *b = (const unsigned char *)s2;
  for (size_t i = 0; i < n; i++) {
    if (a[i] != b[i]) return a[i] - b[i];
  }
  return 0;
}

size_t strlen(const char *s) {
  size_t len = 0;
  while (s[len]) len++;
  return len;
}

size_t strnlen(const char *s, size_t maxlen) {
  size_t len = 0;
  while (len < maxlen && s[len]) len++;
  return len;
}

/* Like strchr, but returns a pointer to the terminating NUL (not NULL) when c
   is not found. GNU extension; musl's glob/fnmatch use it as __strchrnul. */
char *strchrnul(const char *s, int c) {
  char ch = (char)c;
  while (*s && *s != ch) s++;
  return (char *)s;
}

char *strcpy(char *dest, const char *src) {
  size_t i = 0;
  while (src[i]) { dest[i] = src[i]; i++; }
  dest[i] = 0;
  return dest;
}

char *strncpy(char *dest, const char *src, size_t n) {
  size_t i = 0;
  while (i < n && src[i]) { dest[i] = src[i]; i++; }
  while (i < n) { dest[i] = 0; i++; }
  return dest;
}

int strcmp(const char *s1, const char *s2) {
  while (*s1 && *s1 == *s2) { s1++; s2++; }
  return (unsigned char)*s1 - (unsigned char)*s2;
}

int strncmp(const char *s1, const char *s2, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (s1[i] != s2[i] || !s1[i]) return (unsigned char)s1[i] - (unsigned char)s2[i];
  }
  return 0;
}

char *strcat(char *dest, const char *src) {
  char *p = dest;
  while (*p) p++;
  while (*src) { *p = *src; p++; src++; }
  *p = 0;
  return dest;
}

char *strchr(const char *s, int c) {
  while (*s) {
    if (*s == (char)c) return (char *)s;
    s++;
  }
  if (c == 0) return (char *)s;
  return (char *)0;
}

char *strrchr(const char *s, int c) {
  const char *last = (const char *)0;
  while (*s) {
    if (*s == (char)c) last = s;
    s++;
  }
  if (c == 0) return (char *)s;
  return (char *)last;
}

size_t strlcpy(char *dst, const char *src, size_t size) {
  size_t len = strlen(src);
  if (size > 0) {
    size_t n = len < size - 1 ? len : size - 1;
    memcpy(dst, src, n);
    dst[n] = '\0';
  }
  return len;
}

size_t strlcat(char *dst, const char *src, size_t size) {
  size_t dlen = 0;
  while (dlen < size && dst[dlen]) dlen++;
  if (dlen == size) return size + strlen(src);
  return dlen + strlcpy(dst + dlen, src, size - dlen);
}

void *memmem(const void *haystack, size_t haystacklen, const void *needle, size_t needlelen) {
  if (needlelen == 0) return (void *)haystack;
  if (needlelen > haystacklen) return 0;
  const char *h = (const char *)haystack;
  const char *n = (const char *)needle;
  for (size_t i = 0; i + needlelen <= haystacklen; i++) {
    if (h[i] == n[0] && memcmp(h + i, n, needlelen) == 0) return (void *)(h + i);
  }
  return 0;
}

char *strstr(const char *haystack, const char *needle) {
  if (!*needle) return (char *)haystack;
  while (*haystack) {
    const char *h = haystack;
    const char *n = needle;
    while (*h && *n && *h == *n) { h++; n++; }
    if (!*n) return (char *)haystack;
    haystack++;
  }
  return (char *)0;
}

void *memchr(const void *s, int c, size_t n) {
  const unsigned char *p = (const unsigned char *)s;
  for (size_t i = 0; i < n; i++) {
    if (p[i] == (unsigned char)c) return (void *)(p + i);
  }
  return (void *)0;
}

char *strncat(char *dest, const char *src, size_t n) {
  char *p = dest;
  while (*p) p++;
  while (n-- && *src) { *p++ = *src++; }
  *p = 0;
  return dest;
}

size_t strspn(const char *s, const char *accept) {
  size_t count = 0;
  while (*s) {
    const char *a = accept;
    int found = 0;
    while (*a) { if (*s == *a) { found = 1; break; } a++; }
    if (!found) break;
    s++;
    count++;
  }
  return count;
}

size_t strcspn(const char *s, const char *reject) {
  size_t count = 0;
  while (*s) {
    const char *r = reject;
    while (*r) { if (*s == *r) return count; r++; }
    s++;
    count++;
  }
  return count;
}

char *strpbrk(const char *s, const char *accept) {
  while (*s) {
    const char *a = accept;
    while (*a) { if (*s == *a) return (char *)s; a++; }
    s++;
  }
  return (char *)0;
}

char *strtok(char *str, const char *delim) {
  static char *next;
  if (str) next = str;
  if (!next) return (char *)0;
  next += strspn(next, delim);
  if (!*next) { next = (char *)0; return (char *)0; }
  char *tok = next;
  next += strcspn(next, delim);
  if (*next) { *next = 0; next++; }
  else { next = (char *)0; }
  return tok;
}

int strcoll(const char *s1, const char *s2) {
  return strcmp(s1, s2);
}

size_t strxfrm(char *dest, const char *src, size_t n) {
  size_t len = strlen(src);
  if (n > 0) {
    size_t copy = len < n ? len : n - 1;
    size_t i;
    for (i = 0; i < copy; i++) dest[i] = src[i];
    dest[i] = 0;
  }
  return len;
}

char *strerror(int errnum) {
  switch (errnum) {
  case 0:          return "Success";
  case EPERM:      return "Operation not permitted";
  case ENOENT:     return "No such file or directory";
  case ESRCH:      return "No such process";
  case EINTR:      return "Interrupted system call";
  case EIO:        return "Input/output error";
  case ENXIO:      return "No such device or address";
  case E2BIG:      return "Argument list too long";
  case ENOEXEC:    return "Exec format error";
  case EBADF:      return "Bad file descriptor";
  case ECHILD:     return "No child processes";
  case EAGAIN:     return "Resource temporarily unavailable";
  case ENOMEM:     return "Cannot allocate memory";
  case EACCES:     return "Permission denied";
  case EFAULT:     return "Bad address";
  case EBUSY:      return "Device or resource busy";
  case EEXIST:     return "File exists";
  case EXDEV:      return "Invalid cross-device link";
  case ENODEV:     return "No such device";
  case ENOTDIR:    return "Not a directory";
  case EISDIR:     return "Is a directory";
  case EINVAL:     return "Invalid argument";
  case ENFILE:     return "Too many open files in system";
  case EMFILE:     return "Too many open files";
  case ENOTTY:     return "Inappropriate ioctl for device";
  case EFBIG:      return "File too large";
  case ENOSPC:     return "No space left on device";
  case ESPIPE:     return "Illegal seek";
  case EROFS:      return "Read-only file system";
  case EPIPE:      return "Broken pipe";
  case EDOM:       return "Numerical argument out of domain";
  case ERANGE:     return "Numerical result out of range";
  case ENAMETOOLONG: return "File name too long";
  case ENOSYS:     return "Function not implemented";
  case ENOTEMPTY:  return "Directory not empty";
  case ENOLCK:     return "No locks available";
  case EOVERFLOW:  return "Value too large for defined data type";
  /* Socket family (todos/0008 errno.h; strings match glibc wording). */
  case ENOTSOCK:   return "Socket operation on non-socket";
  case EDESTADDRREQ: return "Destination address required";
  case EPROTOTYPE: return "Protocol wrong type for socket";
  case EPROTONOSUPPORT: return "Protocol not supported";
  case EOPNOTSUPP: return "Operation not supported"; /* == ENOTSUP */
  case EAFNOSUPPORT: return "Address family not supported by protocol";
  case EADDRINUSE: return "Address already in use";
  case EADDRNOTAVAIL: return "Cannot assign requested address";
  case ECONNABORTED: return "Software caused connection abort";
  case ECONNRESET: return "Connection reset by peer";
  case ENOBUFS:    return "No buffer space available";
  case EISCONN:    return "Transport endpoint is already connected";
  case ENOTCONN:   return "Transport endpoint is not connected";
  case ETIMEDOUT:  return "Connection timed out";
  case ECONNREFUSED: return "Connection refused";
  case EHOSTUNREACH: return "No route to host";
  case EALREADY:   return "Operation already in progress";
  case EINPROGRESS: return "Operation now in progress";
  default:         return "Unknown error";
  }
}

char *strdup(const char *s) {
  size_t len = strlen(s) + 1;
  char *d = malloc(len);
  if (d) memcpy(d, s, len);
  return d;
}
  `,
  "__strings.c": `
#include <stddef.h>

static int __tolower(int c) {
  if (c >= 'A' && c <= 'Z') return c + ('a' - 'A');
  return c;
}

int strcasecmp(const char *s1, const char *s2) {
  while (*s1 && *s2) {
    int c1 = __tolower((unsigned char)*s1);
    int c2 = __tolower((unsigned char)*s2);
    if (c1 != c2) return c1 - c2;
    s1++;
    s2++;
  }
  return __tolower((unsigned char)*s1) - __tolower((unsigned char)*s2);
}

char *strcasestr(const char *haystack, const char *needle) {
  if (!*needle) return (char *)haystack;
  for (; *haystack; haystack++) {
    const char *h = haystack, *n = needle;
    while (*h && *n && __tolower((unsigned char)*h) == __tolower((unsigned char)*n)) { h++; n++; }
    if (!*n) return (char *)haystack;
  }
  return 0;
}

int strncasecmp(const char *s1, const char *s2, size_t n) {
  for (size_t i = 0; i < n; i++) {
    int c1 = __tolower((unsigned char)*s1);
    int c2 = __tolower((unsigned char)*s2);
    if (c1 != c2) return c1 - c2;
    if (*s1 == '\\0') return 0;
    s1++;
    s2++;
  }
  return 0;
}

int ffs(int x) { return x ? __wasm(int, (x), op 0x68) + 1 : 0; }
int ffsl(long x) { return x ? __wasm(int, (x), op 0x68) + 1 : 0; }
int ffsll(long long x) { return x ? (int)__wasm(long long, (x), op 0x7A) + 1 : 0; }
int fls(int x) { return x ? 32 - __wasm(int, (x), op 0x67) : 0; }
int flsl(long x) { return x ? 32 - __wasm(int, (x), op 0x67) : 0; }
int flsll(long long x) { return x ? 64 - (int)__wasm(long long, (x), op 0x79) : 0; }
  `,
  "__time.c": `
#include <time.h>
#include <stdio.h>

__import long long __time_now(void);
__import long __clock(void);
__import long __timezone_offset(long long t);

time_t time(time_t *t) {
  time_t now = __time_now();
  if (t) *t = now;
  return now;
}

clock_t clock(void) {
  /* __clock() is milliseconds; CLOCKS_PER_SEC is 1000000 (POSIX/XSI). */
  return __clock() * 1000;
}

double difftime(time_t t1, time_t t0) {
  return (double)(t1 - t0);
}

static int __is_leap(int y) {
  return (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
}

static int __days_in_month(int m, int leap) {
  static int mdays[] = {31,28,31,30,31,30,31,31,30,31,30,31};
  if (m == 1 && leap) return 29;
  return mdays[m];
}

static int __days_in_year(int y) {
  return __is_leap(y) ? 366 : 365;
}

static struct tm __gmtime_buf;

static void __secs_to_tm(time_t t, struct tm *res) {
  time_t days = t / 86400;
  long rem = (long)(t % 86400);
  if (rem < 0) { rem += 86400; days--; }

  res->tm_hour = (int)(rem / 3600);
  rem %= 3600;
  res->tm_min = (int)(rem / 60);
  res->tm_sec = (int)(rem % 60);

  /* Jan 1, 1970 was a Thursday (wday=4) */
  int wday = (int)((days + 4) % 7);
  if (wday < 0) wday += 7;
  res->tm_wday = wday;

  int y = 1970;
  if (days >= 0) {
    while (days >= __days_in_year(y)) {
      days -= __days_in_year(y);
      y++;
    }
  } else {
    while (days < 0) {
      y--;
      days += __days_in_year(y);
    }
  }
  res->tm_year = y - 1900;
  res->tm_yday = (int)days;

  int leap = __is_leap(y);
  int m = 0;
  while (m < 11 && days >= __days_in_month(m, leap)) {
    days -= __days_in_month(m, leap);
    m++;
  }
  res->tm_mon = m;
  res->tm_mday = (int)days + 1;
}

struct tm *gmtime(const time_t *timep) {
  __secs_to_tm(*timep, &__gmtime_buf);
  __gmtime_buf.tm_isdst = 0;
  return &__gmtime_buf;
}

static struct tm __localtime_buf;

struct tm *localtime(const time_t *timep) {
  long offset = __timezone_offset(*timep);
  time_t local = *timep + offset;
  __secs_to_tm(local, &__localtime_buf);
  __localtime_buf.tm_isdst = -1;
  __localtime_buf.tm_gmtoff = offset;
  return &__localtime_buf;
}

struct tm *localtime_r(const time_t *timep, struct tm *result) {
  long offset = __timezone_offset(*timep);
  time_t local = *timep + offset;
  __secs_to_tm(local, result);
  result->tm_isdst = -1;
  result->tm_gmtoff = offset;
  return result;
}

time_t mktime(struct tm *tp) {
  /* Normalize mon */
  int m = tp->tm_mon;
  int y = tp->tm_year + 1900;
  while (m < 0)  { m += 12; y--; }
  while (m >= 12) { m -= 12; y++; }
  tp->tm_mon = m;
  tp->tm_year = y - 1900;

  /* Days from epoch to start of year */
  time_t days = 0;
  if (y >= 1970) {
    for (int i = 1970; i < y; i++) days += __days_in_year(i);
  } else {
    for (int i = y; i < 1970; i++) days -= __days_in_year(i);
  }

  /* Days in months */
  int leap = __is_leap(y);
  for (int i = 0; i < m; i++) days += __days_in_month(i, leap);
  days += tp->tm_mday - 1;

  time_t secs = days * 86400LL + tp->tm_hour * 3600LL + tp->tm_min * 60LL + tp->tm_sec;

  /* Adjust for local timezone */
  long offset = __timezone_offset(secs);
  secs -= offset;

  /* Fill in derived fields by converting back */
  struct tm *tmp = localtime(&secs);
  *tp = *tmp;

  return secs;
}

static char __asctime_buf[32];

static const char *__wday_abbr[] = {
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
};
static const char *__mon_abbr[] = {
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
};

char *asctime(const struct tm *tp) {
  sprintf(__asctime_buf, "%s %s %2d %02d:%02d:%02d %d\\n",
      __wday_abbr[tp->tm_wday], __mon_abbr[tp->tm_mon],
      tp->tm_mday, tp->tm_hour, tp->tm_min, tp->tm_sec,
      tp->tm_year + 1900);
  return __asctime_buf;
}

char *ctime(const time_t *timep) {
  return asctime(localtime(timep));
}

static void __ap_str(char *s, size_t max, size_t *pos, const char *src) {
  while (*src && *pos + 1 < max) {
    s[*pos] = *src;
    (*pos)++;
    src++;
  }
}

static void __ap_int(char *s, size_t max, size_t *pos, int val, int width) {
  char buf[16];
  int len = 0;
  int neg = 0;
  int v = val;
  if (v < 0) { neg = 1; v = -v; }
  if (v == 0) { buf[len++] = '0'; }
  else { while (v > 0) { buf[len++] = '0' + v % 10; v /= 10; } }
  /* pad with zeros */
  int total = len + neg;
  while (total < width) { __ap_str(s, max, pos, "0"); total++; }
  if (neg) __ap_str(s, max, pos, "-");
  int i;
  for (i = len - 1; i >= 0; i--) {
    char c[2];
    c[0] = buf[i];
    c[1] = 0;
    __ap_str(s, max, pos, c);
  }
}

static const char *__wday_full[] = {
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday"
};
static const char *__mon_full[] = {
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
};

size_t strftime(char *s, size_t max, const char *fmt, const struct tm *tp) {
  if (max == 0) return 0;
  size_t pos = 0;

  while (*fmt && pos + 1 < max) {
    if (*fmt != '%') {
      s[pos++] = *fmt++;
      continue;
    }
    fmt++; /* skip % */
    /* C23/musl: optional '+' or '0' flag and field width before C/F/G/Y */
    int __fmt_plus = 0;
    int __fmt_width = -1;
    if (*fmt == '+' || *fmt == '0') {
      const char *probe = fmt + (*fmt == '+' || *fmt == '0' ? 1 : 0);
      if (*probe >= '0' && *probe <= '9') {
        __fmt_plus = (*fmt == '+');
        fmt++;
        __fmt_width = 0;
        while (*fmt >= '0' && *fmt <= '9') {
          __fmt_width = __fmt_width * 10 + (*fmt - '0');
          fmt++;
        }
      }
    }
    switch (*fmt) {
    case 'C': { /* century; C23 allows %[+0][width]C */
      int cval = (tp->tm_year + 1900) / 100;
      int w = __fmt_width >= 0 ? __fmt_width : 2;
      if (__fmt_plus && cval >= 0) { __ap_str(s, max, &pos, "+"); if (w > 0) w--; }
      __ap_int(s, max, &pos, cval, w);
      break;
    }
    case 'Y':
      /* musl prints a '+' for years beyond 4 digits */
      if (tp->tm_year + 1900 > 9999) __ap_str(s, max, &pos, "+");
      __ap_int(s, max, &pos, tp->tm_year + 1900, 4);
      break;
    case 'm': __ap_int(s, max, &pos, tp->tm_mon + 1, 2); break;
    case 'd': __ap_int(s, max, &pos, tp->tm_mday, 2); break;
    case 'H': __ap_int(s, max, &pos, tp->tm_hour, 2); break;
    case 'M': __ap_int(s, max, &pos, tp->tm_min, 2); break;
    case 'S': __ap_int(s, max, &pos, tp->tm_sec, 2); break;
    case 'a': __ap_str(s, max, &pos, __wday_abbr[tp->tm_wday]); break;
    case 'A': __ap_str(s, max, &pos, __wday_full[tp->tm_wday]); break;
    case 'b': __ap_str(s, max, &pos, __mon_abbr[tp->tm_mon]); break;
    case 'B': __ap_str(s, max, &pos, __mon_full[tp->tm_mon]); break;
    case 'e': /* day of month, space-padded */
      if (tp->tm_mday < 10) __ap_str(s, max, &pos, " ");
      __ap_int(s, max, &pos, tp->tm_mday, tp->tm_mday < 10 ? 1 : 2);
      break;
    case 'c':
      __ap_str(s, max, &pos, __wday_abbr[tp->tm_wday]);
      __ap_str(s, max, &pos, " ");
      __ap_str(s, max, &pos, __mon_abbr[tp->tm_mon]);
      __ap_str(s, max, &pos, " ");
      /* C/POSIX %c: day is space-padded (as by %e), not zero-padded */
      if (tp->tm_mday < 10) __ap_str(s, max, &pos, " ");
      __ap_int(s, max, &pos, tp->tm_mday, tp->tm_mday < 10 ? 1 : 2);
      __ap_str(s, max, &pos, " ");
      __ap_int(s, max, &pos, tp->tm_hour, 2);
      __ap_str(s, max, &pos, ":");
      __ap_int(s, max, &pos, tp->tm_min, 2);
      __ap_str(s, max, &pos, ":");
      __ap_int(s, max, &pos, tp->tm_sec, 2);
      __ap_str(s, max, &pos, " ");
      if (tp->tm_year + 1900 > 9999) __ap_str(s, max, &pos, "+");
      __ap_int(s, max, &pos, tp->tm_year + 1900, 4);
      break;
    case 'I': {
      int h12 = tp->tm_hour % 12;
      __ap_int(s, max, &pos, h12 == 0 ? 12 : h12, 2);
      break;
    }
    case 'p': __ap_str(s, max, &pos, tp->tm_hour < 12 ? "AM" : "PM"); break;
    case 'j': __ap_int(s, max, &pos, tp->tm_yday + 1, 3); break;
    case 'w': __ap_int(s, max, &pos, tp->tm_wday, 1); break;
    case 'u': __ap_int(s, max, &pos, tp->tm_wday == 0 ? 7 : tp->tm_wday, 1); break;
    case 'y': __ap_int(s, max, &pos, (tp->tm_year + 1900) % 100, 2); break;
    case 'U': __ap_int(s, max, &pos, (tp->tm_yday + 7 - tp->tm_wday) / 7, 2); break;
    case 'W': __ap_int(s, max, &pos, (tp->tm_yday + 7 - (tp->tm_wday ? tp->tm_wday - 1 : 6)) / 7, 2); break;
    case 'x':
      __ap_int(s, max, &pos, tp->tm_mon + 1, 2);
      __ap_str(s, max, &pos, "/");
      __ap_int(s, max, &pos, tp->tm_mday, 2);
      __ap_str(s, max, &pos, "/");
      __ap_int(s, max, &pos, (tp->tm_year + 1900) % 100, 2);
      break;
    case 'X':
      __ap_int(s, max, &pos, tp->tm_hour, 2);
      __ap_str(s, max, &pos, ":");
      __ap_int(s, max, &pos, tp->tm_min, 2);
      __ap_str(s, max, &pos, ":");
      __ap_int(s, max, &pos, tp->tm_sec, 2);
      break;
    case 'Z': break; /* no timezone name available in wasm */
    case 'z': { /* +hhmm from tm_gmtoff (localtime fills it in; gmtime's is 0) */
      long off = tp->tm_gmtoff;
      char zbuf[8];
      long a = off < 0 ? -off : off;
      snprintf(zbuf, sizeof zbuf, "%c%02ld%02ld",
               off < 0 ? '-' : '+', a / 3600, (a % 3600) / 60);
      __ap_str(s, max, &pos, zbuf);
      break;
    }
    case 's': { /* GNU extension, but every shell script's date +%s */
      char sbuf[24];
      snprintf(sbuf, sizeof sbuf, "%lld", (long long)mktime((struct tm *)tp));
      __ap_str(s, max, &pos, sbuf);
      break;
    }
    case '%': s[pos++] = '%'; break;
    case 'n': s[pos++] = '\\n'; break;
    case 't': s[pos++] = '\\t'; break;
    case '\\0': goto done;
    default:
      s[pos++] = '%';
      if (pos + 1 < max) s[pos++] = *fmt;
      break;
    }
    fmt++;
  }
done:
  s[pos] = '\\0';
  return pos;
}

__import long __clock_ns_hi(int clk_id);
__import long __clock_ns_lo(void);

int clock_gettime(clockid_t clk_id, struct timespec *tp) {
  /* __clock_ns_hi(clk_id) latches ONE host time sample as a 64-bit
     nanosecond count (CLOCK_REALTIME is epoch-anchored, CLOCK_MONOTONIC
     never goes backwards) and returns its high 32 bits; __clock_ns_lo()
     returns the low 32 bits of the SAME latched sample. Reassembling one
     64-bit value here keeps sec/nsec coherent — two independent samples
     used to step the clock backwards near second boundaries. */
  unsigned long long ns =
      ((unsigned long long)(unsigned long)__clock_ns_hi(clk_id) << 32) |
      (unsigned long)__clock_ns_lo();
  tp->tv_sec = ns / 1000000000ULL;
  tp->tv_nsec = ns % 1000000000ULL;
  return 0;
}
  `,
};

function getStdlibHeaders() { return _stdlibHeaders; }
function getStdlibSources() { return _stdlibSources; }

// --- Optional extension library (libc-ext.js) ---------------------------
// compiler.js is self-contained for the ISO C (C89/99/11) standard library
// plus a few handwritten goodies. POSIX / 3rd-party pieces that are too big
// to inline (the TRE regex engine, fnmatch, glob) live in an OPTIONAL sibling
// file `libc-ext.js`, a JSON-parseable `const EXT_LIB_MAP = { name: text }`
// mapping header/source names to their contents. The compiler is FULLY
// functional without that file; when present, its headers and sources are
// merged into the stdlib lookup. EXT_PROVIDED_HEADERS lists what it is
// expected to supply, used only to make "not loaded" diagnostics helpful.
const EXT_PROVIDED_HEADERS = ["regex.h", "fnmatch.h", "glob.h"];
let _extLibMap = undefined;
function getExtLibMap() {
  if (_extLibMap !== undefined) return _extLibMap;
  _extLibMap = {};
  // A host that loaded libc-ext.js as a sibling SCRIPT (browser worker via
  // importScripts, QuickJS via evalScript) exposes its top-level
  // `const EXT_LIB_MAP` in the shared global lexical scope — honor it
  // first; the filesystem lookup below is the Node path.
  try {
    /* eslint-disable no-undef */
    if (typeof EXT_LIB_MAP !== "undefined" && EXT_LIB_MAP) {
      _extLibMap = EXT_LIB_MAP;
      return _extLibMap;
    }
  } catch (e) { /* TDZ or absent: fall through */ }
  // Locate libc-ext.js next to compiler.js. __dirname works when compiler.js
  // is run or required under Node; the browser shim (new Function(...)) has no
  // __dirname, so fall back to argv[1]'s directory — where the app mounts the
  // vendored compiler.js and its siblings (host.js, libc-ext.js). The read is
  // OPTIONAL: absence is fine; only a present-but-broken file is reported.
  if (typeof require === "undefined") return _extLibMap;
  let dir = null;
  if (typeof __dirname !== "undefined") dir = __dirname;
  else if (typeof process !== "undefined" && process.argv && process.argv[1]) {
    try { dir = require("path").dirname(process.argv[1]); } catch (e) { dir = null; }
  }
  if (dir === null) return _extLibMap;
  let fs, path;
  try { fs = require("fs"); path = require("path"); } catch (e) { return _extLibMap; }
  const file = path.join(dir, "libc-ext.js");
  let present = false;
  try { present = fs.existsSync(file); } catch (e) { present = false; }
  if (!present) return _extLibMap;
  try {
    const text = fs.readFileSync(file, "utf-8");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("EXT_LIB_MAP object literal not found");
    _extLibMap = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    const msg = "warning: libc-ext.js present but could not be loaded: " + (e && e.message) + "\\n";
    if (typeof process !== "undefined" && process.stderr) process.stderr.write(msg);
    else if (typeof console !== "undefined") console.error(msg);
    _extLibMap = {};
  }
  return _extLibMap;
}

function createDefaultPPRegistry() {
  const pp = new Lexer.PPRegistry();

  // Load standard library headers
  const headers = getStdlibHeaders();
  for (const [name, content] of Object.entries(headers)) {
    pp.standardHeaders.set(name, content);
  }
  // Merge optional extension headers (libc-ext.js), if present. Source files
  // (.c) in the map are resolved separately at __require_source time.
  for (const [name, content] of Object.entries(getExtLibMap())) {
    if (name.endsWith(".h")) pp.standardHeaders.set(name, content);
  }
  // Manifest of headers the optional libc-ext.js supplies — lets a missing
  // <regex.h>/<glob.h>/<fnmatch.h> report that the extension isn't present.
  pp.extProvidedHeaders = EXT_PROVIDED_HEADERS;

  // Predefined macros (matching C++ compiler)
  const defs = {
    "__MTOTS__": "1",
    "__STDC__": "1",
    "__STDC_VERSION__": "201112L",
    "__STDC_HOSTED__": "1",
    "__STDC_NO_ATOMICS__": "1",
    "__STDC_NO_COMPLEX__": "1",
    "__STDC_NO_THREADS__": "1",
    "__STDC_NO_VLA__": "1",
    "__wasm__": "1",
    "__wasm32__": "1",
    "__ILP32__": "1",
    "__ORDER_LITTLE_ENDIAN__": "1234",
    "__ORDER_BIG_ENDIAN__": "4321",
    "__BYTE_ORDER__": "__ORDER_LITTLE_ENDIAN__",
    "__LITTLE_ENDIAN__": "1",
    "__SIZEOF_SHORT__": "2",
    "__SIZEOF_INT__": "4",
    "__SIZEOF_LONG__": "4",
    "__SIZEOF_LONG_LONG__": "8",
    "__SIZEOF_FLOAT__": "4",
    "__SIZEOF_DOUBLE__": "8",
    "__SIZEOF_POINTER__": "4",
    "__SIZEOF_SIZE_T__": "4",
    "__SIZEOF_PTRDIFF_T__": "4",
  };
  for (const [k, v] of Object.entries(defs)) {
    pp.defines.set(k, v);
  }

  pp.prelude = [
    "#define __builtin_clz(x) __wasm(int, (x), op 0x67)",
    "#define __builtin_ctz(x) __wasm(int, (x), op 0x68)",
    "#define __builtin_clzl(x) __builtin_clz(x)",
    "#define __builtin_ctzl(x) __builtin_ctz(x)",
    "#define __builtin_clzll(x) ((int)__wasm(long long, (x), op 0x79))",
    "#define __builtin_ctzll(x) ((int)__wasm(long long, (x), op 0x7a))",
    // Byte-swap builtins (GCC/Clang). wasm has no native bswap opcode, so
    // expand to the arithmetic form. Callers pass simple values in practice;
    // the argument is parenthesized but evaluated more than once.
    "#define __builtin_bswap16(x) ((unsigned short)((((unsigned short)(x) & 0xff00u) >> 8) | (((unsigned short)(x) & 0x00ffu) << 8)))",
    "#define __builtin_bswap32(x) ((unsigned int)((((unsigned int)(x) & 0xff000000u) >> 24) | (((unsigned int)(x) & 0x00ff0000u) >> 8) | (((unsigned int)(x) & 0x0000ff00u) << 8) | (((unsigned int)(x) & 0x000000ffu) << 24)))",
    "#define __builtin_bswap64(x) ((unsigned long long)( (((unsigned long long)(x) & 0xff00000000000000ull) >> 56) | (((unsigned long long)(x) & 0x00ff000000000000ull) >> 40) | (((unsigned long long)(x) & 0x0000ff0000000000ull) >> 24) | (((unsigned long long)(x) & 0x000000ff00000000ull) >> 8) | (((unsigned long long)(x) & 0x00000000ff000000ull) << 8) | (((unsigned long long)(x) & 0x0000000000ff0000ull) << 24) | (((unsigned long long)(x) & 0x000000000000ff00ull) << 40) | (((unsigned long long)(x) & 0x00000000000000ffull) << 56) ))",
  ].join("\n") + "\n";

  return pp;
}

function parseAllUnits(fs, pp, inputFiles, options) {
  const units = [];
  const requiredSources = new Set();
  const pendingRequiredSources = [];
  const stdlibSources = getStdlibSources();
  const exceptionTagRegistry = new Map(); // global cross-TU exception tag unification
  let hasErrors = false;
  const writeErr = options && options.writeErr
    ? options.writeErr
    : (typeof process !== 'undefined' ? (s) => process.stderr.write(s) : () => {});
  const timing = options?.timing;
  const hrtime = timing
    ? (typeof process !== 'undefined' && process.hrtime
      ? () => { const [s, ns] = process.hrtime(); return s * 1000 + ns / 1e6; }
      : () => performance.now())
    : null;

  // Auto-require __alloca.c
  requiredSources.add("__alloca.c");
  pendingRequiredSources.push("__alloca.c");
  for (const src of (options.compilerOptions.requireSources || [])) {
    if (!requiredSources.has(src)) {
      requiredSources.add(src);
      pendingRequiredSources.push(src);
    }
  }

  const processSource = (filename, source) => {
    pp.onceGuards = new Set();
    const filenameInterned = Lexer.intern(filename);
    const tLex = hrtime ? hrtime() : 0;
    const result = Lexer.tokenize(filenameInterned, source, pp);
    if (timing) timing.lexMs += hrtime() - tLex;
    if (result.errors.length > 0) {
      writeErr(`Got ${result.errors.length} lex errors in ${filename}.\n`);
      for (const err of result.errors) {
        writeErr(`${err.filename}:${err.line}: error: ${err.message}\n`);
      }
      hasErrors = true;
      return;
    }
    const tParse = hrtime ? hrtime() : 0;
    const parseResult = Parser.parseTokens(result.tokens, { ...options, exceptionTagRegistry });
    const unit = parseResult.translationUnit;
    for (const req of unit.requiredSources) {
      if (!requiredSources.has(req)) {
        requiredSources.add(req);
        pendingRequiredSources.push(req);
      }
    }
    // Per-TU passes (before linking). Goto resolution lives in the codegen
    // now (out-of-scope diagnostics are emitted by Codegen.generateCode as
    // it walks the AST). Implicit-cast insertion happens inline at parse
    // time at each construction site.
    // The lowering can emit diagnostics (residual setjmp in unsupported
    // positions) — run it against the same sink as the parse so they're
    // reported through the normal parse-error flow below.
    try {
      withDiag(parseResult, () => Parser.lowerSetjmpLongjmp(unit, exceptionTagRegistry));
    } catch (e) {
      if (!(e instanceof FatalDiag)) throw e;
    }
    if (!options?.compilerOptions?.noFold) {
      INLINER.optimize(unit, { noUndefined: !!options?.compilerOptions?.noUndefined });
    }
    if (!options?.compilerOptions?.noGotoNormalize &&
        !options?.compilerOptions?.forceIrreducibleLowering) {
      GOTO_NORMALIZER.optimize(unit);
    }
    // IRREDUCIBLE_LOWERING is invoked on-demand at codegen time, only for
    // functions whose structured emit failed (see the retry block in the
    // wasm emitter driver). The default path is structured codegen for
    // every function; we only pay the rewrite + retry cost for functions
    // that genuinely can't be expressed structurally.
    if (timing) timing.parseMs += hrtime() - tParse;
    if (parseResult.errors.length > 0) {
      hasErrors = true;
      writeErr(`Got ${parseResult.errors.length} parse errors in ${filename}.\n`);
      for (const err of parseResult.errors) {
        writeErr(`${err.filename}:${err.line}: error: ${err.message}\n`);
      }
    }
    for (const w of parseResult.warnings) {
      writeErr(`${w.filename}:${w.line}: warning: ${w.message}\n`);
    }
    units.push(unit);
  };

  for (const file of inputFiles) {
    const source = fs.readFileSync(file, "utf-8");
    pp.sourceBuffers.set(file, source);
    processSource(file, source);
  }

  while (pendingRequiredSources.length > 0) {
    const name = pendingRequiredSources.shift();
    const source = stdlibSources[name] || getExtLibMap()[name];
    if (!source) {
      writeErr(`Unknown stdlib source: ${name}\n`);
      hasErrors = true;
      continue;
    }
    pp.sourceBuffers.set(name, source);
    processSource(name, source);
  }

  if (hasErrors) {
    // An embedder that injected writeErr (the OS kernel's compile hook, the
    // unit runner, any library caller) is collecting diagnostics and must
    // survive the failure; process.exit is CLI-only behavior. The marker
    // tells callers every diagnostic already flowed through writeErr — no
    // stack dump needed.
    if (!(options && options.writeErr) &&
        typeof process !== 'undefined' && process.exit) process.exit(1);
    var failure = new Error("Compilation failed");
    failure.compilationFailed = true;
    throw failure;
  }
  return units;
}

return { getStdlibHeaders, getStdlibSources, createDefaultPPRegistry, parseAllUnits };
})();
  return Stdlib;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = createStdlib;
}
if (typeof self !== 'undefined') {
  self.createStdlib = createStdlib;
}
if (typeof window !== 'undefined') {
  window.createStdlib = createStdlib;
}
if (typeof globalThis !== 'undefined') {
  globalThis.createStdlib = createStdlib;
}
