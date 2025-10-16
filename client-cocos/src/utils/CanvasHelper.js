/**
 * Canvas绘制辅助函数
 */

class CanvasHelper {
  /**
   * 绘制圆角矩形
   */
  static drawRoundRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  /**
   * 填充圆角矩形
   */
  static fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.save();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
    }
    this.drawRoundRect(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 描边圆角矩形
   */
  static strokeRoundRect(ctx, x, y, width, height, radius, strokeStyle, lineWidth) {
    ctx.save();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
    }
    if (lineWidth) {
      ctx.lineWidth = lineWidth;
    }
    this.drawRoundRect(ctx, x, y, width, height, radius);
    ctx.stroke();
    ctx.restore();
  }
}

module.exports = CanvasHelper;

