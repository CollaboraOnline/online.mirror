/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

#include <vcl/remoteclipboard.hxx>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <mutex>
#include <optional>
#include <utility>

#include <com/sun/star/datatransfer/UnsupportedFlavorException.hpp>
#include <com/sun/star/io/IOException.hpp>
#include <com/sun/star/io/XOutputStream.hpp>
#include <com/sun/star/ucb/Command.hpp>
#include <com/sun/star/ucb/OpenCommandArgument2.hpp>
#include <com/sun/star/ucb/OpenMode.hpp>
#include <com/sun/star/ucb/XCommandEnvironment.hpp>
#include <com/sun/star/ucb/XCommandProcessor.hpp>
#include <com/sun/star/ucb/XContent.hpp>
#include <comphelper/diagnose_ex.hxx>
#include <comphelper/kit.hxx>
#include <comphelper/processfactory.hxx>
#include <cppuhelper/implbase.hxx>
#include <cppuhelper/typeprovider.hxx>
#include <rtl/ref.hxx>
#include <rtl/uri.hxx>
#include <sal/log.hxx>
#include <salhelper/simplereferenceobject.hxx>
#include <salhelper/thread.hxx>
#include <sot/formats.hxx>
#include <tools/lazydelete.hxx>
#include <ucbhelper/content.hxx>
#include <vcl/kit.hxx>
#include <vcl/svapp.hxx>
#include <vcl/timer.hxx>
#include <vcl/transfer.hxx>
#include <vcl/weld.hxx>

#include <strings.hrc>
#include <svdata.hxx>

using namespace cpo::uno;

namespace vcl::remoteclipboard
{
namespace
{
/// The value of a wire format length line: lower or upper case hex digits, nothing else.
std::optional<sal_uInt64> parseHexLength(std::string_view rLine)
{
    if (rLine.empty() || rLine.size() > 16)
        return std::nullopt;

    sal_uInt64 nLength = 0;
    for (const char c : rLine)
    {
        int nDigit;
        if (c >= '0' && c <= '9')
            nDigit = c - '0';
        else if (c >= 'a' && c <= 'f')
            nDigit = c - 'a' + 10;
        else if (c >= 'A' && c <= 'F')
            nDigit = c - 'A' + 10;
        else
            return std::nullopt;
        nLength = nLength * 16 + nDigit;
    }
    return nLength;
}

/// Serves the formats of a downloaded clipboard from memory.
class WireTransferable : public cppu::WeakImplHelper<css::datatransfer::XTransferable>
{
    Sequence<css::datatransfer::DataFlavor> m_aFlavors;
    std::vector<Any> m_aContent;

public:
    explicit WireTransferable(std::vector<Item>&& rItems)
    {
        std::vector<css::datatransfer::DataFlavor> aFlavors;
        aFlavors.reserve(rItems.size());
        m_aContent.reserve(rItems.size());
        for (Item& rItem : rItems)
        {
            css::datatransfer::DataFlavor aFlavor;
            initFlavourFromMime(aFlavor, OUString::fromUtf8(rItem.aMimeType));

            // Several wire types can map to one flavour, the plain text variants for
            // example; the first one wins.
            const bool bKnown = std::any_of(aFlavors.begin(), aFlavors.end(),
                                            [&aFlavor](const css::datatransfer::DataFlavor& rOther)
                                            { return rOther.MimeType == aFlavor.MimeType; });
            if (bKnown)
                continue;

            const sal_Int32 nSize = static_cast<sal_Int32>(rItem.aData.size());
            Any aContent;
            if (aFlavor.DataType == cppu::UnoType<OUString>::get())
                aContent <<= OUString(rItem.aData.data(), nSize, RTL_TEXTENCODING_UTF8);
            else
                aContent <<= Sequence<sal_Int8>(
                    reinterpret_cast<const sal_Int8*>(rItem.aData.data()), nSize);
            aFlavors.push_back(std::move(aFlavor));
            m_aContent.push_back(std::move(aContent));
        }
        m_aFlavors = Sequence<css::datatransfer::DataFlavor>(aFlavors.data(), aFlavors.size());
    }

    Any getTransferData(const css::datatransfer::DataFlavor& rFlavor) override
    {
        for (sal_Int32 i = 0; i < m_aFlavors.getLength(); ++i)
        {
            if (m_aFlavors[i].MimeType == rFlavor.MimeType)
                return m_aContent[i];
        }
        throw css::datatransfer::UnsupportedFlavorException(rFlavor.MimeType,
                                                            static_cast<XTransferable*>(this));
    }

    Sequence<css::datatransfer::DataFlavor> getTransferDataFlavors() override { return m_aFlavors; }

    bool isDataFlavorSupported(const css::datatransfer::DataFlavor& rFlavor) override
    {
        return std::any_of(std::cbegin(m_aFlavors), std::cend(m_aFlavors),
                           [&rFlavor](const css::datatransfer::DataFlavor& rOther) {
                               return rOther.MimeType == rFlavor.MimeType
                                      && rOther.DataType == rFlavor.DataType;
                           });
    }
};
}

// cf. sot/source/base/exchange.cxx for the string typed exceptions.
void initFlavourFromMime(css::datatransfer::DataFlavor& rFlavor, OUString aMimeType)
{
    if (aMimeType.startsWith("text/plain"))
    {
        aMimeType = u"text/plain;charset=utf-16"_ustr;
        rFlavor.DataType = cppu::UnoType<OUString>::get();
    }
    else if (aMimeType.startsWith("text/markdown"))
    {
        aMimeType = u"text/markdown"_ustr;
        rFlavor.DataType = cppu::UnoType<OUString>::get();
    }
    else if (aMimeType == "application/x-libreoffice-markdown-annotated")
        rFlavor.DataType = cppu::UnoType<OUString>::get();
    else if (aMimeType == "application/x-libreoffice-tsvc")
        rFlavor.DataType = cppu::UnoType<OUString>::get();
    else
        rFlavor.DataType = cppu::UnoType<Sequence<sal_Int8>>::get();
    rFlavor.MimeType = aMimeType;
    rFlavor.HumanPresentableName = aMimeType;
}

bool isWireFormat(std::string_view rBody)
{
    const size_t nMimeEnd = rBody.find('\n');
    if (nMimeEnd == std::string_view::npos || nMimeEnd == 0)
        return false;

    const size_t nLengthEnd = rBody.find('\n', nMimeEnd + 1);
    if (nLengthEnd == std::string_view::npos)
        return false;

    const std::optional<sal_uInt64> oLength
        = parseHexLength(rBody.substr(nMimeEnd + 1, nLengthEnd - nMimeEnd - 1));
    return oLength && *oLength > 0;
}

// The same tuple layout is read by common/ClipboardData.hpp on the online side. The engine cannot
// link that header, so the format is parsed again here.
bool parseWireFormat(std::string_view rBody, std::vector<Item>& rItems)
{
    size_t nPos = 0;
    while (nPos < rBody.size())
    {
        const size_t nMimeEnd = rBody.find('\n', nPos);
        if (nMimeEnd == std::string_view::npos)
            return false;

        const size_t nLengthEnd = rBody.find('\n', nMimeEnd + 1);
        if (nLengthEnd == std::string_view::npos)
            return false;

        const std::optional<sal_uInt64> oLength
            = parseHexLength(rBody.substr(nMimeEnd + 1, nLengthEnd - nMimeEnd - 1));
        if (!oLength)
            return false;

        const size_t nDataStart = nLengthEnd + 1;
        if (*oLength > rBody.size() - nDataStart)
            return false;

        const std::string_view aMimeType = rBody.substr(nPos, nMimeEnd - nPos);
        if (!aMimeType.empty())
        {
            Item aItem;
            aItem.aMimeType = OString(aMimeType.data(), static_cast<sal_Int32>(aMimeType.size()));
            aItem.aData = std::string(rBody.substr(nDataStart, *oLength));
            rItems.push_back(std::move(aItem));
        }

        // Each tuple closes with a newline after its bytes.
        nPos = nDataStart + *oLength;
        if (nPos < rBody.size() && rBody[nPos] == '\n')
            ++nPos;
    }
    return true;
}

Reference<css::datatransfer::XTransferable> createTransferable(std::vector<Item>&& rItems)
{
    return new WireTransferable(std::move(rItems));
}

OUString getOrigin(std::string_view rHtml)
{
    static constexpr std::string_view aPrefix = "<div id=\"meta-origin\" data-coolorigin=\"";
    const size_t nStart = rHtml.find(aPrefix);
    if (nStart == std::string_view::npos)
        return OUString();

    const size_t nValue = nStart + aPrefix.size();
    const size_t nEnd = rHtml.find('"', nValue);
    if (nEnd == std::string_view::npos)
        return OUString();

    // The shape checks the browser makes on the still-encoded value: the path of a clipboard
    // endpoint with the document, the server, the view and the access tag.
    const std::string_view aEncoded = rHtml.substr(nValue, nEnd - nValue);
    if (aEncoded.find("%2Fclipboard%3FWOPISrc%3D") == std::string_view::npos
        || aEncoded.find("%26ServerId%3D") == std::string_view::npos
        || aEncoded.find("%26ViewId%3D") == std::string_view::npos
        || aEncoded.find("%26Tag%3D") == std::string_view::npos)
        return OUString();

    const OUString aDecoded = rtl::Uri::decode(OUString::fromUtf8(aEncoded),
                                               rtl_UriDecodeWithCharset, RTL_TEXTENCODING_UTF8);
    if (aDecoded.startsWithIgnoreAsciiCase("http://")
        || aDecoded.startsWithIgnoreAsciiCase("https://"))
        return aDecoded;

    return OUString();
}

namespace
{
/// The most a remote clipboard may grow to before the download is given up.
constexpr sal_uInt64 nMaxBodySize = sal_uInt64(256) * 1024 * 1024;

/// How long a paste waits for the download before it shows the progress dialog.
constexpr std::chrono::milliseconds aGracePeriod(300);

Fetcher& theTestFetcher()
{
    static Fetcher aFetcher;
    return aFetcher;
}

/**
 * One download of a remote clipboard. The worker thread fills it in and the main thread polls
 * it, so the members both sides touch are atomics or live under the mutex. The waiter count is
 * main thread only.
 */
class Download : public salhelper::SimpleReferenceObject
{
    const OUString m_aUrl;
    std::mutex m_aMutex;
    std::string m_aBody;
    std::vector<Item> m_aItems;
    Reference<css::ucb::XCommandProcessor> m_xProcessor;
    sal_Int32 m_nCommandId = 0;
    bool m_bAborted = false;
    bool m_bSucceeded = false;
    Reference<css::datatransfer::XTransferable> m_xTransferable;
    std::atomic<sal_uInt64> m_nBytesReceived{ 0 };
    std::atomic<bool> m_bDone{ false };
    int m_nWaiters = 0;

public:
    explicit Download(OUString aUrl)
        : m_aUrl(std::move(aUrl))
    {
    }

    const OUString& getUrl() const { return m_aUrl; }
    bool isDone() const { return m_bDone.load(std::memory_order_acquire); }
    sal_uInt64 getBytesReceived() const
    {
        return m_nBytesReceived.load(std::memory_order_relaxed);
    }

    /// Starts the download: on a worker thread, or through the test fetcher when one is set.
    void start();

    /**
     * Worker side: remembers the running command so the main thread can abort it. False when the
     * download was cancelled before the command started, so the worker gives up.
     */
    bool registerCommand(const Reference<css::ucb::XCommandProcessor>& xProcessor,
                         sal_Int32 nCommandId)
    {
        std::scoped_lock aGuard(m_aMutex);
        if (m_bAborted)
            return false;
        m_xProcessor = xProcessor;
        m_nCommandId = nCommandId;
        return true;
    }

    /// Worker side: another chunk of the body. False once the size cap is reached.
    bool appendBytes(const Sequence<sal_Int8>& rData)
    {
        std::scoped_lock aGuard(m_aMutex);
        if (m_aBody.size() + rData.getLength() > nMaxBodySize)
            return false;
        m_aBody.append(reinterpret_cast<const char*>(rData.getConstArray()), rData.getLength());
        m_nBytesReceived.store(m_aBody.size(), std::memory_order_relaxed);
        return true;
    }

    /// Worker side: the body is complete; true when it is a wire format clipboard.
    bool parseBody()
    {
        std::scoped_lock aGuard(m_aMutex);
        return isWireFormat(m_aBody) && parseWireFormat(m_aBody, m_aItems);
    }

    /// Worker side: publishes the outcome. From here on the main thread reads the items.
    void finish(bool bSucceeded)
    {
        {
            std::scoped_lock aGuard(m_aMutex);
            m_bSucceeded = bSucceeded && !m_bAborted;
            m_aBody.clear();
            m_aBody.shrink_to_fit();
            m_xProcessor.clear();
        }
        m_bDone.store(true, std::memory_order_release);
    }

    void addWaiter() { ++m_nWaiters; }

    /**
     * A waiter leaves. When it cancelled and no other paste is waiting, the download is aborted;
     * the return value says whether that happened.
     */
    bool removeWaiter(bool bCancelled)
    {
        --m_nWaiters;
        if (!bCancelled || m_nWaiters > 0)
            return false;
        abort();
        return true;
    }

    /// The downloaded content as a transferable, built once and shared by every paste of it.
    /// Empty when the download failed.
    Reference<css::datatransfer::XTransferable> getTransferable()
    {
        std::scoped_lock aGuard(m_aMutex);
        if (!m_xTransferable.is() && m_bSucceeded)
            m_xTransferable = createTransferable(std::move(m_aItems));
        return m_xTransferable;
    }

private:
    void abort()
    {
        Reference<css::ucb::XCommandProcessor> xProcessor;
        sal_Int32 nCommandId = 0;
        {
            std::scoped_lock aGuard(m_aMutex);
            m_bAborted = true;
            xProcessor = m_xProcessor;
            nCommandId = m_nCommandId;
        }
        if (!xProcessor.is())
            return;
        try
        {
            xProcessor->abort(nCommandId);
        }
        catch (const Exception&)
        {
            TOOLS_WARN_EXCEPTION("vcl.remoteclipboard", "aborting the remote clipboard download");
        }
    }
};

/// Receives the body of the download chunk by chunk.
class Sink : public cppu::WeakImplHelper<css::io::XOutputStream>
{
    rtl::Reference<Download> m_pDownload;

public:
    explicit Sink(rtl::Reference<Download> pDownload)
        : m_pDownload(std::move(pDownload))
    {
    }

    void writeBytes(const Sequence<sal_Int8>& rData) override
    {
        if (!m_pDownload->appendBytes(rData))
            throw css::io::IOException(u"the remote clipboard is larger than the size limit"_ustr);
    }

    void flush() override {}
    void closeOutput() override {}
};

/// Runs one download through the UCB on its own thread.
class FetchThread : public salhelper::Thread
{
    rtl::Reference<Download> m_pDownload;

public:
    explicit FetchThread(rtl::Reference<Download> pDownload)
        : Thread("vcl remote clipboard fetch")
        , m_pDownload(std::move(pDownload))
    {
    }

private:
    void execute() override
    {
        bool bSucceeded = false;
        try
        {
            // An empty command environment turns a certificate or authentication problem into
            // a plain failure; the worker thread cannot show a dialog for it.
            ucbhelper::Content aContent(m_pDownload->getUrl(),
                                        Reference<css::ucb::XCommandEnvironment>(),
                                        comphelper::getProcessComponentContext());
            Reference<css::ucb::XCommandProcessor> xProcessor(aContent.get(), UNO_QUERY_THROW);
            const sal_Int32 nCommandId = xProcessor->createCommandIdentifier();
            if (m_pDownload->registerCommand(xProcessor, nCommandId))
            {
                // The "open" command streams the body into the sink as it arrives. Issued through
                // the command processor itself, it is one request that the main thread can abort
                // by its id; ucbhelper::Content::openStream would first send a separate request
                // to check that the URL is a document.
                Reference<css::io::XOutputStream> xSink(new Sink(m_pDownload));
                css::ucb::OpenCommandArgument2 aArgument;
                aArgument.Mode = css::ucb::OpenMode::DOCUMENT;
                aArgument.Priority = 0;
                aArgument.Sink = xSink;

                css::ucb::Command aCommand;
                aCommand.Name = u"open"_ustr;
                aCommand.Handle = -1;
                aCommand.Argument <<= aArgument;
                xProcessor->execute(aCommand, nCommandId,
                                    Reference<css::ucb::XCommandEnvironment>());
                bSucceeded = m_pDownload->parseBody();
            }
        }
        catch (const Exception&)
        {
            TOOLS_WARN_EXCEPTION("vcl.remoteclipboard", "downloading the remote clipboard");
        }
        m_pDownload->finish(bSucceeded);
    }
};

void Download::start()
{
    const Fetcher& rTestFetcher = theTestFetcher();
    if (rTestFetcher)
    {
        std::string aBody;
        const bool bFetched = rTestFetcher(m_aUrl, aBody);
        {
            std::scoped_lock aGuard(m_aMutex);
            m_aBody = std::move(aBody);
        }
        finish(bFetched && parseBody());
        return;
    }

    rtl::Reference<FetchThread> pThread(new FetchThread(this));
    pThread->launch();
}

/**
 * The last download and the clipboard it was made for. The HTML on the system clipboard
 * identifies a copy: the URL in its marker belongs to the browser session and serves whatever was
 * copied last there, while each copy writes its own HTML. So a paste of the same HTML, and the
 * reads a single paste makes, reuse one download, and new HTML means a new download.
 */
struct Downloads
{
    /// The HTML the download was made for. Empty when nothing is held.
    std::string aHtml;
    /// The download, in flight or finished.
    rtl::Reference<Download> pDownload;
    /// The finished download's content, when it succeeded.
    Reference<css::datatransfer::XTransferable> xTransferable;
    /// When the download failed, so that pastes of the same HTML do not repeat it at once.
    std::optional<std::chrono::steady_clock::time_point> oFailedAt;
};

/// How long a failed download holds back further pastes of the same clipboard.
constexpr std::chrono::seconds aFailureMemory(30);

/// The title the browser writes into the HTML for a selection too large to put on the clipboard.
/// That HTML reads the same for every such copy, so it identifies none of them.
constexpr std::string_view aStubTitle = "<title>Stub HTML Message</title>";

tools::DeleteOnDeinit<Downloads>& theDownloads()
{
    static tools::DeleteOnDeinit<Downloads> aDownloads{};
    return aDownloads;
}

/// Brackets a wait that spins the main loop, so the kit's poll loop knows the re-entry is meant.
struct ReentryGuard
{
    ReentryGuard() { vcl::kit::pushExpectedReentry(); }
    ~ReentryGuard() { vcl::kit::popExpectedReentry(); }
};

/**
 * Puts the kit's current view back after a wait. Messages for other documents that the main loop
 * handles during the wait make their own view current.
 */
class ViewGuard
{
    const int m_nView;

public:
    ViewGuard()
        : m_nView(comphelper::COKit::getView())
    {
    }
    ~ViewGuard()
    {
        if (m_nView >= 0 && comphelper::COKit::getView() != m_nView)
            comphelper::COKit::setView(m_nView);
    }
};

OUString formatReceived(sal_uInt64 nBytes)
{
    if (nBytes >= 1024 * 1024)
    {
        const sal_uInt64 nTenths = nBytes * 10 / (1024 * 1024);
        const OUString aMegabytes
            = OUString::number(nTenths / 10) + "." + OUString::number(nTenths % 10);
        return VclResId(STR_REMOTE_CLIPBOARD_RECEIVED_MB).replaceFirst(u"%1", aMegabytes);
    }
    return VclResId(STR_REMOTE_CLIPBOARD_RECEIVED_KB)
        .replaceFirst(u"%1", OUString::number(nBytes / 1024));
}

/// The modal dialog shown while a slow download runs. It ends itself when the download is done.
class ProgressDialog final : public weld::GenericDialogController
{
    Download& m_rDownload;
    AutoTimer m_aPoll;
    std::unique_ptr<weld::Label> m_xReceived;
    std::unique_ptr<weld::ProgressBar> m_xProgress;
    int m_nPulse = 0;

    DECL_LINK(PollHdl, Timer*, void);
    void update();

public:
    ProgressDialog(weld::Window* pParent, Download& rDownload)
        : GenericDialogController(pParent, u"vcl/ui/remoteclipboardprogress.ui"_ustr,
                                  u"RemoteClipboardProgressDialog"_ustr)
        , m_rDownload(rDownload)
        , m_aPoll("vcl::remoteclipboard::ProgressDialog poll")
        , m_xReceived(m_xBuilder->weld_label(u"received"_ustr))
        , m_xProgress(m_xBuilder->weld_progress_bar(u"progressbar"_ustr))
    {
        m_xProgress->set_size_request(m_xProgress->get_approximate_digit_width() * 40, -1);
        m_aPoll.SetTimeout(100);
        m_aPoll.SetInvokeHandler(LINK(this, ProgressDialog, PollHdl));
        m_aPoll.Start();
        update();
    }
};

IMPL_LINK_NOARG(ProgressDialog, PollHdl, Timer*, void)
{
    if (m_rDownload.isDone())
    {
        m_aPoll.Stop();
        response(RET_OK);
        return;
    }
    update();
}

void ProgressDialog::update()
{
    m_xReceived->set_label(formatReceived(m_rDownload.getBytesReceived()));
    // The server does not say how much is coming, so the bar shows activity, not a share.
    m_nPulse = (m_nPulse + 4) % 100;
    m_xProgress->set_percentage(m_nPulse);
}

enum class Wait
{
    /// The download finished, with success or failure.
    Done,
    /// The user stopped the download in the progress dialog.
    Cancelled
};

/// Spins the main loop until rDownload is done or the user cancels it in the progress dialog.
Wait waitForDownload(Download& rDownload, weld::Window* pParent)
{
    if (rDownload.isDone())
        return Wait::Done;

    ReentryGuard aReentry;
    ViewGuard aView;

    // The tick makes Application::Yield return regularly while nothing else happens in the
    // main loop, so the loop condition is checked again.
    AutoTimer aTick("vcl::remoteclipboard wait tick");
    aTick.SetTimeout(50);
    aTick.Start();

    // Most clipboards arrive within the grace period, so the dialog only appears for a slow
    // download.
    const auto aDeadline = std::chrono::steady_clock::now() + aGracePeriod;
    while (!rDownload.isDone() && std::chrono::steady_clock::now() < aDeadline
           && !Application::IsQuit())
        Application::Yield();

    if (rDownload.isDone())
        return Wait::Done;

    if (!pParent)
    {
        // With no window to parent a dialog to, the download cannot be cancelled; wait for it.
        while (!rDownload.isDone() && !Application::IsQuit())
            Application::Yield();
        return Wait::Done;
    }

    aTick.Stop();
    ProgressDialog aDialog(pParent, rDownload);
    return aDialog.run() == RET_OK ? Wait::Done : Wait::Cancelled;
}

/// The text/html the clipboard offers, as bytes, or empty when it offers none.
std::string peekHtml(TransferableDataHelper& rData)
{
    if (!rData.HasFormat(SotClipboardFormatId::HTML))
        return std::string();

    const Sequence<sal_Int8> aHtml = rData.GetSequence(SotClipboardFormatId::HTML, OUString());
    return std::string(reinterpret_cast<const char*>(aHtml.getConstArray()), aHtml.getLength());
}
}

Outcome resolveForPaste(TransferableDataHelper& rData, weld::Window* pParent)
{
    if (!rData.GetTransferable().is())
        return Outcome::Untouched;

    Downloads* pDownloads = theDownloads().get();
    if (!pDownloads)
        return Outcome::Untouched;

    const std::string aHtml = peekHtml(rData);
    const OUString aOrigin = getOrigin(aHtml);
    if (aOrigin.isEmpty())
    {
        // Not a remote clipboard, so the last download is of no further use.
        *pDownloads = Downloads();
        return Outcome::Untouched;
    }

    // Other HTML on the clipboard means another copy. The stub reads the same for every large
    // copy, so it starts over every time.
    const bool bIdentifiesCopy = aHtml.find(aStubTitle) == std::string::npos;
    if (!bIdentifiesCopy || pDownloads->aHtml != aHtml)
        *pDownloads = Downloads();

    if (pDownloads->xTransferable.is())
    {
        rData.Rebind(pDownloads->xTransferable);
        return Outcome::Resolved;
    }
    if (pDownloads->oFailedAt
        && std::chrono::steady_clock::now() - *pDownloads->oFailedAt < aFailureMemory)
        return Outcome::Untouched;

    // A download still running for this clipboard is joined, so a paste in another document
    // waits for it instead of starting a second one.
    if (!pDownloads->pDownload)
    {
        pDownloads->aHtml = aHtml;
        pDownloads->oFailedAt.reset();
        pDownloads->pDownload = new Download(aOrigin);
        pDownloads->pDownload->start();
    }
    rtl::Reference<Download> pDownload = pDownloads->pDownload;

    pDownload->addWaiter();
    const Wait eWait = waitForDownload(*pDownload, pParent);
    const bool bAborted = pDownload->removeWaiter(eWait == Wait::Cancelled);

    // A paste in another document may have run inside the wait and replaced the entry, so look it
    // up again before storing anything.
    pDownloads = theDownloads().get();
    const bool bStillCurrent = pDownloads && pDownloads->pDownload == pDownload;

    if (eWait == Wait::Cancelled)
    {
        // The paste goes ahead with the content already on the clipboard. Once the last waiting
        // paste has cancelled, the next paste of this clipboard starts a fresh download.
        if (bAborted && bStillCurrent)
            *pDownloads = Downloads();
        return Outcome::Untouched;
    }

    if (!pDownload->isDone())
        return Outcome::Untouched;

    Reference<css::datatransfer::XTransferable> xTransferable = pDownload->getTransferable();
    if (bStillCurrent)
    {
        pDownloads->pDownload.clear();
        if (xTransferable.is())
            pDownloads->xTransferable = xTransferable;
        else
            pDownloads->oFailedAt = std::chrono::steady_clock::now();
    }

    if (!xTransferable.is())
        return Outcome::Untouched;

    rData.Rebind(xTransferable);
    return Outcome::Resolved;
}

void setFetcherForTesting(Fetcher aFetcher) { theTestFetcher() = std::move(aFetcher); }

void clearCache()
{
    if (Downloads* pDownloads = theDownloads().get())
        *pDownloads = Downloads();
}
}

/* vim:set shiftwidth=4 softtabstop=4 expandtab cinoptions=b1,g0,N-s cinkeys+=0=break: */
