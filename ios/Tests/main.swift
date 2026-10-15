import Foundation

func allowed(_ text: String) -> Bool { AppConfiguration.isPortal(URL(string: text)!) }
assert(allowed("https://attendance.xshadox.com/"))
assert(allowed("https://attendance.xshadox.com:443/document-approval/example"))
assert(!allowed("http://attendance.xshadox.com/"))
assert(!allowed("https://attendance.xshadox.com.evil.example/"))
assert(!allowed("https://evil.example/attendance.xshadox.com"))
assert(!allowed("https://attendance.xshadox.com:8443/"))
assert(!allowed("https://user:secret@attendance.xshadox.com/"))
assert(!AppConfiguration.canOpenExternally(URL(string: "javascript:alert(1)")!))
assert(!AppConfiguration.canOpenExternally(URL(string: "file:///etc/passwd")!))
assert(!AppConfiguration.canOpenExternally(URL(string: "http://example.com/")!))
assert(AppConfiguration.canOpenExternally(URL(string: "https://example.com/")!))
assert(AppConfiguration.canOpenExternally(URL(string: "mailto:test@example.com")!))
print("iOS portal origin and external-link security checks passed")
