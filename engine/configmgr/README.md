# UNO Services to Access the Configuration Database

## Functional Overview

This code parses the settings that are described in the `officecfg`
directory, and provides a UNO API that code can use to set and get
settings.

## Source Overview

    configurationprovider.cxx
    configurationregistry.cxx
    defaultprovider.cxx
    services.cxx
UNO service implementations.

    access.cxx
    childaccess.cxx
    rootaccess.cxx
UNO objects passed to clients.

    components.cxx
Central singleton that aggregates all data (reads in the XML files, manages
modifications and global notifications).

    groupnode.cxx
    localizedpropertynode.cxx
    localizedvaluenode.cxx
    node.cxx
    propertynode.cxx
    setnode.cxx
Internal representations of data nodes.

    parsemanager.cxx
    parser.hxx
    valueparser.cxx
    xcdparser.cxx
    xcsparser.cxx
    xcuparser.cxx
    xmldata.cxx
XML file reading.

    modifications.cxx
    writemodfile.cxx
Modification management.

    broadcaster.cxx
Notification management.

    additions.hxx
    update.cxx
Extension manager interface.

    data.cxx
    lock.cxx
    nodemap.cxx
    partial.cxx
    path.hxx
    type.cxx
Utilities.


## Some Implementation Notes

### Mandatory Set Members

- A set member can be marked as "mandatory," meaning that a member of that name
must always be present in a set.

- The above definition implies that calling replaceByName on a mandatory set
member is OK.

- The XCU format can contain `oor:mandatory` attributes on nodes.  (The XCS format
does not support them.  In the `registrymodifications` file, `oor:mandatory`
attributes should never be needed, as being mandatory cannot be controlled via
the UNO API.)  The XCU reading code only evaluates the `oor:mandatory` attribute
for set members, and ignores it everywhere else.

- Only true sets support mandatory members.  A localized property for the "`*`"
locale, though acting much like a set, does not support mandatory members.

- The "LibreOffice Registry Format" document claims that group extension
properties are implicitly mandatory, but at least the new configmgr code does
not treat them like that (i.e., they can be removed again).

- For simplicity, `setMandatory/getMandatory` are available as virtual functions
at the base `Node`, even though they can only make sense for `GroupNodes` and
SetNodes that are set members.  The default `getMandatory` implementation returns
`NO_LAYER`, meaning `oor:mandatory` is not set to true in any layer.  (Returning
`NO_LAYER` simplifies the code, e.g., `removeByName` does not have to check whether
`getMandatory` is called on a member of a true set to decide whether to forbid
removal.)

- When committing changes (made through the UNO API), the "mandatory" status of
inserted nodes must be updated (in case the insert is due to a `replaceByName`, or
the "mandatory" flag was added by a concurrent modification of a lower layer).
Also, for to-be-removed nodes, removal is ignored for (newly; due to concurrent
modification of a lower layer) mandatory nodes (but still recorded in
`registrymodifications`, so may take effect once the lower layer addition is
removed again---whether or not that is a good idea).


### XcuParser Modification Recording

- `XcuParser` records modifications when reading user layer data
(`valueParser_.getLayer() == Data::NO_LAYER`).

- `oor:finalized and `oor:mandatory` attributes cannot be set via the UNO API, so
it is assumed that user layer data does not contain them (for one, they are not
written by `writeModFile`; for another, the logic to record modifications expects
a `locprop(modify,fuse)` to be followed by one or more `value(fuse,remove)`, which
would not necessarily be true if the `locprop` were only present in the user layer
data to flag it as finalized).

- The logic to record modifications considers the top of the XML element stack.
In the following list of all possible cases, items marked with an asterisk are
recorded:

        ... group(modify,fuse) - group(modify,fuse) - ...
        ... group(modify,fuse) - set(modify,fuse) - ...
        ... group(modify,fuse) - *prop(modify,fuse,replace) - value(fuse)
        ... group(modify,fuse) - *prop(remove)
        ... group(modify,fuse) - locprop(modify,fuse) - *value(fuse)
        ... group(modify,fuse) - locprop(modify,fuse) - *value(remove)
        ... group(modify,fuse) - *locprop(replace) ...
        ... set(modify,fuse,replace) - group(modify/fuse) - ...
        ... set(modify,fuse,replace) - *group(replace/fuse) - ...
        ... set(modify,fuse,replace) - *group(remove)
        ... set(modify,fuse,replace) - set(modify/fuse) - ...
        ... set(modify,fuse,replace) - *set(replace/fuse) - ...
        ... set(modify,fuse,replace) - *set(remove)
        Legend:
            "...": zero or more further items
            "- ...": one or more further items
            "modify,fuse" etc.: any of those operations
            "modify/fuse": a modify or a fuse on an existing member
            "replace/fuse": a replace or a fuse on a non-existing member


## macOS Managed Preferences Layer

On Windows, administrators deploy settings through Group Policy, which the
`winreg` layers read from the registry (`winreg.cxx`). The macOS counterpart is
the `macosprefs` layer (`macosprefs.mm`), which reads the application's
**preferences**: the settings an MDM configuration profile delivers for the
application's bundle identifier, and the plain defaults of the same domain.
The application lists it in `CONFIGURATION_LAYERS` as `macosprefs:` (nothing
after the colon); the kit does so in `kit/SetupKitEnvironment.hpp`, after the
`sharedext` layer, so a managed setting overrides the shipped defaults, and a
setting marked `Final` is read-only for the user as well.

The preference domain is the bundle identifier of the application that hosts
the engine, for the CODA-M macOS app the `--with-app-package-name` value. The
preferences are read once, when the configuration is first used, so a changed
profile needs an application restart.

### Keys

Every preference key that starts with `/` is a configuration path whose last
segment is the property name; keys that do not start with `/` are left alone,
so the application's other defaults are not disturbed. The path uses the same
syntax as `oor:path` in an `.xcu` file:

    /org.openoffice.Office.Common/Save/Document/AutoSave
    /org.openoffice.Office.Paths/Paths/org.openoffice.Office.Paths:NamedPath['Work']/WritePath

A segment written as `Name#op` (with `op` one of `modify`, `replace`, `fuse` or
`remove`) becomes a `<node oor:name="Name" oor:op="op">` element, and so does
every segment after it. That is how a set member is created; it corresponds to
`Name/#op` in a registry key on Windows:

    /org.openoffice.Office.OptionsDialog/OptionsDialogGroups/ProductName#fuse/Pages/Java#fuse/Hide

### Values

The value of a key can be

- a plain value: string, boolean, integer, real, or data (written as
  `hexBinary`). It is parsed with the type the property has in the schema, so no
  type needs to be given.
- an array of plain values: the items of a list property such as
  `oor:string-list`.
- a dictionary with the same entries the Windows registry layer uses:

  | Entry             | Meaning                                                               |
  |-------------------|-----------------------------------------------------------------------|
  | `Value`           | the plain value or array                                              |
  | `Type`            | the `oor:type`, e.g. `xs:boolean` or `oor:string-list`; needed only for properties of type `any` and for new properties of extensible groups |
  | `Final`           | `true` locks the setting: the user cannot change it, and a value in `registrymodifications.xcu` is ignored |
  | `Nil`             | `true` sets the property to nil (`<value xsi:nil="true"/>`)           |
  | `External`        | `true` if `Value` names an external backend, as in `com.sun.star.configuration.backend.LdapUserProfileBe company` |
  | `ExternalBackend` | the backend, prepended to `Value` when `External` is set              |

  A flag is set by a boolean `true`, the integer `1`, or the strings `"1"` and
  `"true"`.

`Final` is honoured only for values that were delivered by a configuration
profile (what `NSUserDefaults` calls a forced value). A `Final` on a value that
was written with `defaults write` is ignored, with a `SAL_INFO` message: only an
administrator can lock a setting. Values that cannot be mapped (a date, a nested
array, a key without a property name, an unknown node operation) are skipped
with a `SAL_WARN`, and the rest of the layer is still loaded.

### A configuration profile

A custom settings payload whose `PayloadType` is the bundle identifier carries
the keys next to the usual `Payload*` entries. MDM products (Jamf Pro
"Application & Custom Settings", Intune "Preference file", and so on) generate
such a payload from a property list; a hand-written profile looks like this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.example.coda</string>
            <key>PayloadIdentifier</key>
            <string>com.example.coda.settings</string>
            <key>PayloadUUID</key>
            <string>6E4C7B1E-2F0A-4B6B-9C3D-1A2B3C4D5E6F</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadDisplayName</key>
            <string>Collabora Office settings</string>
            <key>/org.openoffice.Office.Common/Security/Scripting/MacroSecurityLevel</key>
            <dict>
                <key>Value</key>
                <integer>3</integer>
                <key>Final</key>
                <true/>
            </dict>
            <key>/org.openoffice.Office.Common/Security/Scripting/SecureURL</key>
            <array>
                <string>file:///opt/corp/macros</string>
            </array>
            <key>/org.openoffice.Office.Common/Save/Document/AutoSave</key>
            <false/>
            <key>/org.openoffice.UserProfile/Data/o</key>
            <string>Example Corp.</string>
        </dict>
    </array>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadIdentifier</key>
    <string>com.example.coda.settings.profile</string>
    <key>PayloadUUID</key>
    <string>0F1E2D3C-4B5A-4968-8776-655443322110</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    <key>PayloadDisplayName</key>
    <string>Collabora Office</string>
    <key>PayloadScope</key>
    <string>System</string>
</dict>
</plist>
```

Replace `com.example.coda` with the bundle identifier of the deployed
application, and the UUIDs with fresh ones.

### Trying it without an MDM

The same keys can be written into the application's defaults; they are read
like managed ones, except that `Final` is ignored:

    defaults write com.example.coda '/org.openoffice.Office.Common/Save/Document/AutoSave' -bool false
    defaults write com.example.coda '/org.openoffice.UserProfile/Data/o' -dict Value 'Example Corp.' Final 1
    defaults delete com.example.coda '/org.openoffice.Office.Common/Save/Document/AutoSave'

`SAL_LOG=+INFO.configmgr` logs every key the layer reads, and with
`SAL_CONFIG_MACOSPREFS_RETAIN_TMP=1` the generated `.xcu` is kept in the
temporary directory and its location logged, which is the quickest way to see
what a profile produced. A profile can also be installed by hand on an
unmanaged Mac, from System Settings, to check that a value is forced.
