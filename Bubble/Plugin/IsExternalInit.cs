// Polyfill para init-only setters (C# 9) en .NET Framework 4.8
#if NETFRAMEWORK
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit { }
}
#endif