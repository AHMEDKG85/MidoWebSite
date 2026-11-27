import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'حدث خطأ غير متوقع في التطبيق.';
    try {
      const parsed = JSON.parse(readable) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        readable = `تعذر تنفيذ العملية (${parsed.operationType || 'read'}): ${parsed.error}`;
      }
    } catch {
      // plain string error
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('App ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#F7F6F2] text-[#141413] flex items-center justify-center p-6"
        >
          <div className="max-w-lg w-full bg-white rounded-2xl border border-[#141413]/12 p-8 text-center space-y-4">
            <h1 className="text-xl font-bold text-[#141413]">حدث خطأ أثناء تحميل البيانات</h1>
            <p className="text-sm text-[#4A4843] leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-xl bg-[#141413] text-white text-sm font-medium hover:bg-[#2B2B29]"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
